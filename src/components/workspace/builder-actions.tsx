import { useCruxStoreApi } from '@/stores/cruxStore';
import { buttonClass } from '@/components/ui/button-class';
import { useOpenFileByPath, useOpenRound } from './useOpenRound';
import { useCallback, useRef, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import { serializeFrontmatter, slugify, interpolate } from '@/lib/frontmatter';
import { Modal, Input, Button } from '@/components/ui';
import type { ContentCollection, BuilderAction } from '@/templates';
import type { Artifact } from '@/api/types';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { Capability, can } from '@/lib/platform';
import { mediaKindFor, isStreamingReady } from '@/lib/media-kind';
import { formatBytes } from '@/lib/format';
import {
  CAPTION_OFFER_MIN,
  MAX_TRANSCODE_BYTES,
  captionTasksFor,
  describeBatch,
  titleFromFileName,
  uniqueFileName,
  uniqueItemPath,
  type CaptionItem,
} from './builder-files';
import { useTurns } from '@/services/turns';

function artifactPaths(useCruxStore: ReturnType<typeof useCruxStoreApi>): Set<string> {
  return new Set(
    useCruxStore
      .getState()
      .artifacts.map((a) => (a.meta?.path as string | undefined) || a.filename || ''),
  );
}

function namesInFolder(paths: Set<string>, folder: string): Set<string> {
  const prefix = folder + '/';
  const names = new Set<string>();
  for (const p of paths) if (p.startsWith(prefix)) names.add(p.slice(prefix.length));
  return names;
}

/** The Builder's action buttons: new item, add image, add photos, add media, custom actions. */
// ── Action buttons ───────────────────────────────────────────────────────────

export function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={buttonClass('secondary', 'sm', 'justify-start')}>
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

export function NewItemButton({ collection }: { collection: ContentCollection }) {
  const createFile = useCruxStore((s) => s.createFile);
  const openFile = useUIStore((s) => s.openFile);
  // In-app title dialog — window.prompt() does not exist in Electron, so the
  // old code threw before a post could ever be created on desktop.
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const vars = {
        slug: slugify(trimmed),
        title: trimmed,
        today: new Date().toISOString().slice(0, 10),
      };
      const path = interpolate(collection.new.pathTemplate, vars);
      const frontmatter: Record<string, string> = {};
      for (const [key, value] of Object.entries(collection.new.frontmatter)) {
        frontmatter[key] = interpolate(value, vars);
      }
      const content = serializeFrontmatter(frontmatter, collection.new.body ?? '\n');
      const artifact = await createFile(path, content);
      setAsking(false);
      setTitle('');
      openFile(artifact.id, path);
    } finally {
      setCreating(false);
    }
  }, [collection, createFile, openFile, title, creating]);

  return (
    <>
      <ActionButton
        icon="✏️"
        label={`New ${collection.singular.toLowerCase()}`}
        onClick={() => setAsking(true)}
      />
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        size="sm"
        title={`New ${collection.singular.toLowerCase()}`}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${collection.singular} title`}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim()} loading={creating}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AddImageButton() {
  const uploadFiles = useCruxStore((s) => s.uploadFiles);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const entries = files.map((f) => ({
        file: f,
        path: `public/images/${f.name.replace(/\s+/g, '-')}`,
      }));
      await uploadFiles(entries);
      const snippet = entries
        .map((entry) => `![](${entry.path.replace(/^public/, '')})`)
        .join('\n');
      try {
        await navigator.clipboard.writeText(snippet);
      } catch {
        /* clipboard unavailable — snippet still valid */
      }
      void alertDialog(
        `Added ${entries.length} image${entries.length > 1 ? 's' : ''}. ` +
          `Markdown snippet copied — paste it into any post.`,
        'Images added',
      );
      e.target.value = '';
    },
    [uploadFiles],
  );

  return (
    <>
      <ActionButton icon="🖼️" label="Add images" onClick={() => inputRef.current?.click()} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </>
  );
}

/**
 * Add photos: upload images into public/images/ and write one post per image
 * (the collection's `image` field), so a feed fills from a file picker.
 */
export function AddPhotosButton({
  collection,
  label,
  icon,
}: {
  collection: ContentCollection;
  label: string;
  icon?: string;
}) {
  const cruxStore = useCruxStoreApi();
  const { canCollaborate, runParallelJob } = useTurns();
  const uploadFile = useCruxStore((s) => s.uploadFile);
  const createFile = useCruxStore((s) => s.createFile);
  const openFile = useUIStore((s) => s.openFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
      e.target.value = '';
      if (!files.length) return;
      // Names taken before this batch, plus what the batch itself adds — so
      // two "IMG_0001.jpg" never share one artifact path or one image URL.
      const takenPaths = artifactPaths(cruxStore);
      const takenNames = namesInFolder(takenPaths, 'public/images');
      let last: { artifact: Artifact; path: string } | null = null;
      const failed: string[] = [];
      const captionItems: CaptionItem[] = [];
      let added = 0;
      try {
        for (const [i, file] of files.entries()) {
          setStatus(`Adding ${file.name} (${i + 1}/${files.length})…`);
          try {
            // Upload under the sanitised name — the frontmatter points at it,
            // and a raw name with spaces or parentheses would 404 once published.
            const publicName = uniqueFileName(file.name, takenNames);
            takenNames.add(publicName);
            const upload = new File([file], publicName, { type: file.type });
            const uploaded = await uploadFile(upload, 'public/images');
            const uploadedPath = (uploaded.meta?.path as string | undefined) || '';
            takenPaths.add(uploadedPath);
            const imageUrl = uploadedPath.startsWith('public/')
              ? uploadedPath.slice('public'.length)
              : `/images/${publicName}`;

            const title = titleFromFileName(file.name);
            const { path, vars } = uniqueItemPath(collection.new.pathTemplate, title, takenPaths);
            const frontmatter: Record<string, string> = {};
            for (const [key, value] of Object.entries(collection.new.frontmatter))
              frontmatter[key] = interpolate(value, vars);
            frontmatter.image = imageUrl;
            const artifact = await createFile(
              path,
              serializeFrontmatter(frontmatter, collection.new.body ?? '\n'),
            );
            takenPaths.add(path);
            captionItems.push({ path, imagePath: uploadedPath });
            last = { artifact, path };
            added += 1;
          } catch (err) {
            failed.push(`${file.name}: ${(err as Error).message || 'unknown error'}`);
          }
        }
        if (last) openFile(last.artifact.id, last.path);
        const summary = describeBatch({
          added,
          singular: collection.singular.toLowerCase(),
          failed,
        });
        // A big batch is wide, independent work: offer to caption it with
        // parallel workers (B5) — only when a model can actually run.
        if (added >= CAPTION_OFFER_MIN && (await canCollaborate())) {
          const write = await confirmDialog({
            title: 'Photos added',
            message: `${summary} Write a caption for each one now? Workers look at the photos in parallel, each on its own Growth branch, and the captions merge into the posts.`,
            confirmLabel: 'Write captions',
            cancelLabel: 'Not now',
          });
          if (write)
            void runParallelJob(
              `Write captions for ${added} photos`,
              captionTasksFor(captionItems),
            );
        } else {
          void alertDialog(
            summary + (added ? ' One per photo — add captions in each, or ask for them.' : ''),
            failed.length && !added ? 'Add photos' : 'Photos added',
          );
        }
      } finally {
        setStatus(null);
      }
    },
    [
      cruxStore,
      openFile,
      collection.singular,
      collection.new.pathTemplate,
      collection.new.body,
      collection.new.frontmatter,
      canCollaborate,
      uploadFile,
      createFile,
      runParallelJob,
    ],
  );

  return (
    <>
      <ActionButton
        icon={icon ?? '📷'}
        label={status ?? label}
        onClick={() => !status && inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
        data-testid="add-photos-input"
      />
    </>
  );
}

/**
 * Add media: upload audio/video into public/media/, transcoding through ffmpeg
 * when the browser couldn't play the original (desktop only — on web the file
 * is uploaded as-is), then write one item per file into the collection so it
 * shows up with a player immediately.
 */
export function AddMediaButton({
  collection,
  label,
  icon,
}: {
  collection: ContentCollection;
  label: string;
  icon?: string;
}) {
  const cruxStore = useCruxStoreApi();
  const uploadFile = useCruxStore((s) => s.uploadFile);
  const createFile = useCruxStore((s) => s.createFile);
  const openFile = useUIStore((s) => s.openFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      const canTranscode = can(Capability.Transcode);
      const takenPaths = artifactPaths(cruxStore);
      const takenNames = namesInFolder(takenPaths, 'public/media');
      let last: { artifact: Artifact; path: string } | null = null;
      let converted = 0;
      let skipped = 0;
      let added = 0;
      const failed: string[] = [];
      try {
        for (const [i, file] of files.entries()) {
          const kind = mediaKindFor(file.type, file.name);
          if (!kind) {
            skipped += 1;
            continue;
          }
          try {
            let publicName = file.name;
            let toUpload: File = file;
            let mimeType = file.type;
            if (canTranscode && !isStreamingReady(file.type, file.name)) {
              // The transcode path reads the whole file into memory and sends
              // it over IPC in one message — refuse anything past the cap.
              if (file.size > MAX_TRANSCODE_BYTES) {
                throw new Error(
                  `too large to convert (${formatBytes(file.size)}; the limit is ${formatBytes(MAX_TRANSCODE_BYTES)}). Convert it to MP4 or M4A first.`,
                );
              }
              setStatus(`Converting ${file.name} (${i + 1}/${files.length})…`);
              const { transcode } = await import('@/services/media');
              const outputs = await transcode(
                {
                  inputData: new Uint8Array(await file.arrayBuffer()),
                  inputName: file.name,
                  isAudio: kind === 'audio',
                },
                (p) => setStatus(`Converting ${file.name} — ${Math.round(p)}%`),
              );
              const out = outputs[0];
              // No output is a failure, not a reason to ship the unplayable original.
              if (!out || !out.data || out.data.byteLength === 0) {
                throw new Error('conversion produced no output');
              }
              publicName = out.name;
              mimeType = out.mimeType;
              toUpload = new File([new Uint8Array(out.data)], publicName, { type: mimeType });
              converted += 1;
            }
            publicName = uniqueFileName(publicName, takenNames);
            takenNames.add(publicName);
            if (toUpload.name !== publicName) {
              toUpload = new File([toUpload], publicName, { type: mimeType });
            }
            setStatus(`Adding ${publicName}…`);
            const uploaded = await uploadFile(toUpload, 'public/media');
            const uploadedPath = (uploaded.meta?.path as string | undefined) || '';
            takenPaths.add(uploadedPath);
            const mediaUrl = uploadedPath.startsWith('public/')
              ? uploadedPath.slice('public'.length)
              : `/media/${publicName}`;

            const title = titleFromFileName(file.name);
            const { path, vars } = uniqueItemPath(collection.new.pathTemplate, title, takenPaths);
            const frontmatter: Record<string, string> = {};
            for (const [key, value] of Object.entries(collection.new.frontmatter))
              frontmatter[key] = interpolate(value, vars);
            frontmatter.kind = kind;
            frontmatter.media = mediaUrl;
            const artifact = await createFile(
              path,
              serializeFrontmatter(frontmatter, collection.new.body ?? '\n'),
            );
            takenPaths.add(path);
            last = { artifact, path };
            added += 1;
          } catch (err) {
            failed.push(`${file.name}: ${(err as Error).message || 'unknown error'}`);
          }
        }
        if (last) openFile(last.artifact.id, last.path);
        void alertDialog(
          describeBatch({ added, singular: 'item', converted, skipped, failed }),
          failed.length && !added ? 'Add media' : 'Media added',
        );
      } finally {
        setStatus(null);
      }
    },
    [
      cruxStore,
      openFile,
      uploadFile,
      collection.new.pathTemplate,
      collection.new.body,
      collection.new.frontmatter,
      createFile,
    ],
  );

  return (
    <>
      <ActionButton
        icon={icon ?? '🎬'}
        label={status ?? label}
        onClick={() => !status && inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*,.mov,.mkv,.flac,.wav,.m4a,.mp3,.mp4,.webm"
        multiple
        className="hidden"
        onChange={handleFiles}
        data-testid="add-media-input"
      />
    </>
  );
}

export function CustomAction({
  action,
  onSettings,
  onPublish,
}: {
  action: BuilderAction;
  onSettings: () => void;
  onPublish: () => void;
}) {
  const openFileByPath = useOpenFileByPath();
  const openRound = useOpenRound();
  const handle = useCallback(() => {
    switch (action.do.type) {
      case 'edit-settings':
        onSettings();
        break;
      case 'publish':
        onPublish();
        break;
      case 'open-file':
        openFileByPath(action.do.path);
        break;
      case 'open-round':
        openRound();
        break;
      default:
        break; // new-item / add-image / add-media / add-photos / add-shelf-entry render as derived buttons already
    }
  }, [action, onSettings, onPublish, openFileByPath, openRound]);

  return <ActionButton icon={action.icon} label={action.label} onClick={handle} />;
}
