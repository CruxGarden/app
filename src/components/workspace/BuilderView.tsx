import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCruxStore, selectHasUnpublishedChanges } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { getServices } from '@/services';
import { cn } from '@/lib/cn';
import { publicCruxUrl } from '@/lib/public-url';
import {
  parseFrontmatter,
  serializeFrontmatter,
  slugify,
  interpolate,
  globToRegex,
} from '@/lib/frontmatter';
import { Modal, Input, Button } from '@/components/ui';
import type { ContentModel, ContentCollection, BuilderAction } from '@/templates';
import type { Artifact } from '@/api/types';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { Capability, can } from '@/lib/platform';
import { mediaKindFor, isStreamingReady } from '@/lib/media-kind';
import { formatBytes } from '@/lib/format';
import {
  MAX_TRANSCODE_BYTES,
  describeBatch,
  titleFromFileName,
  uniqueFileName,
  uniqueItemPath,
} from './builder-files';

/** Action types the Builder renders from dedicated components, not CustomAction. */
const DERIVED_ACTIONS = new Set<BuilderAction['do']['type']>([
  'new-item',
  'add-image',
  'add-media',
  'add-photos',
]);

/** Paths of every artifact in the crux (meta.path, falling back to filename). */
function artifactPaths(): Set<string> {
  return new Set(
    useCruxStore
      .getState()
      .artifacts.map((a) => (a.meta?.path as string | undefined) || a.filename || ''),
  );
}

/** Filenames already present under `folder` (e.g. 'public/images'). */
function namesInFolder(paths: Set<string>, folder: string): Set<string> {
  const prefix = folder + '/';
  const names = new Set<string>();
  for (const p of paths) if (p.startsWith(prefix)) names.add(p.slice(prefix.length));
  return names;
}

/**
 * The Builder — the Workshop's home view for content-model cruxes.
 *
 * Rendered entirely from crux.meta.contentModel (TEMPLATE-CONTENT-MODEL.md).
 * This surface is for non-technical people: collections as cards, one-click
 * creation, settings as a form. The file tree and raw Astro project are one
 * TopBar toggle away for anyone who wants to drop down.
 */

interface CollectionItem {
  artifact: Artifact;
  path: string;
  data: Record<string, string>;
}

function useCollectionItems(collection: ContentCollection): CollectionItem[] {
  const artifacts = useCruxStore((s) => s.artifacts);
  return useMemo(() => {
    const matcher = globToRegex(collection.glob);
    const items: CollectionItem[] = [];
    for (const artifact of artifacts) {
      const path = (artifact.meta?.path as string | undefined) || artifact.filename || '';
      if (!matcher.test(path)) continue;
      items.push({ artifact, path, data: {} });
    }
    return items;
  }, [artifacts, collection.glob]);
}

export default function BuilderView() {
  const crux = useCruxStore((s) => s.crux);
  const contentModel = (crux?.meta as { contentModel?: ContentModel } | undefined)?.contentModel;
  if (!crux || !contentModel) return null;
  return <BuilderBody cruxTitle={crux.title || 'Untitled'} model={contentModel} />;
}

function BuilderBody({ cruxTitle, model }: { cruxTitle: string; model: ContentModel }) {
  const crux = useCruxStore((s) => s.crux)!;
  const artifacts = useCruxStore((s) => s.artifacts);
  const hasUnpublishedChanges = useCruxStore(selectHasUnpublishedChanges);
  const openFile = useUIStore((s) => s.openFile);
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);

  // Site identity from the settings file when present (title/description)
  const settingsArtifact = useMemo(() => {
    if (!model.settings) return null;
    return (
      artifacts.find(
        (a) => ((a.meta?.path as string | undefined) || a.filename) === model.settings!.path,
      ) ?? null
    );
  }, [artifacts, model.settings]);

  // Live URL mirrors PublishPane's construction (viewer route on crux.garden)
  const author = useAppStore((s) => s.author);
  const isPublished = (crux.meta as Record<string, unknown> | undefined)?.publishedAt != null;
  const publishedUrl = isPublished && author ? publicCruxUrl(author.username, crux.slug) : null;

  const openSettings = useCallback(() => {
    if (settingsArtifact) {
      openFile(settingsArtifact.id, model.settings!.path);
    }
  }, [settingsArtifact, openFile, model.settings]);

  const openPublish = useCallback(() => setPaneVisible('publish', true), [setPaneVisible]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* ── Masthead ── */}
        <header>
          <h1 className="font-display text-lg text-text">{cruxTitle}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
            {publishedUrl ? (
              <>
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline truncate max-w-[16rem]"
                >
                  {publishedUrl.replace(/^https?:\/\//, '')}
                </a>
                {hasUnpublishedChanges && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                    unpublished changes
                  </span>
                )}
              </>
            ) : (
              <span>Not published yet</span>
            )}
            <button
              onClick={openPublish}
              className="ml-auto shrink-0 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] bg-accent text-bg hover:opacity-90 transition-opacity cursor-pointer"
            >
              🚀 Publish
            </button>
          </div>
        </header>

        {/* ── Actions ── */}
        <section className="flex flex-wrap gap-2">
          {model.collections.map((collection) => (
            <NewItemButton key={collection.name} collection={collection} />
          ))}
          {model.settings && settingsArtifact && (
            <ActionButton icon="⚙️" label="Site settings" onClick={openSettings} />
          )}
          <AddImageButton />
          {(model.actions ?? [])
            .filter((a) => a.do.type === 'add-photos')
            .map((a) => {
              const target = model.collections.find(
                (c) => c.name === (a.do as { collection: string }).collection,
              );
              return target ? (
                <AddPhotosButton key={a.label} collection={target} label={a.label} icon={a.icon} />
              ) : null;
            })}
          {(model.actions ?? [])
            .filter((a) => a.do.type === 'add-media')
            .map((a) => {
              const target = model.collections.find(
                (c) => c.name === (a.do as { collection: string }).collection,
              );
              return target ? (
                <AddMediaButton key={a.label} collection={target} label={a.label} icon={a.icon} />
              ) : null;
            })}
          {(model.actions ?? [])
            .filter((a) => !DERIVED_ACTIONS.has(a.do.type))
            .map((action, i) => (
              <CustomAction
                key={i}
                action={action}
                onSettings={openSettings}
                onPublish={openPublish}
              />
            ))}
        </section>

        {/* ── Collections ── */}
        {model.collections.map((collection) => (
          <CollectionSection key={collection.name} collection={collection} />
        ))}

        <p className="text-2xs text-text-muted/60 text-center">
          This is a real Astro project — open the Artifacts panel to work with the files directly.
        </p>
      </div>
    </div>
  );
}

// ── Action buttons ───────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-xs rounded-[var(--radius-sm)]',
        'bg-surface border border-border text-text',
        'hover:border-accent hover:text-accent transition-colors cursor-pointer',
      )}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function NewItemButton({ collection }: { collection: ContentCollection }) {
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

function AddImageButton() {
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
function AddPhotosButton({
  collection,
  label,
  icon,
}: {
  collection: ContentCollection;
  label: string;
  icon?: string;
}) {
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
      const takenPaths = artifactPaths();
      const takenNames = namesInFolder(takenPaths, 'public/images');
      let last: { artifact: Artifact; path: string } | null = null;
      const failed: string[] = [];
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
            last = { artifact, path };
            added += 1;
          } catch (err) {
            failed.push(`${file.name}: ${(err as Error).message || 'unknown error'}`);
          }
        }
        if (last) openFile(last.artifact.id, last.path);
        void alertDialog(
          describeBatch({ added, singular: collection.singular.toLowerCase(), failed }) +
            (added ? ' One per photo — add captions in each, or ask for them.' : ''),
          failed.length && !added ? 'Add photos' : 'Photos added',
        );
      } finally {
        setStatus(null);
      }
    },
    [collection, uploadFile, createFile, openFile],
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
function AddMediaButton({
  collection,
  label,
  icon,
}: {
  collection: ContentCollection;
  label: string;
  icon?: string;
}) {
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
      const takenPaths = artifactPaths();
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
    [collection, uploadFile, createFile, openFile],
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

function CustomAction({
  action,
  onSettings,
  onPublish,
}: {
  action: BuilderAction;
  onSettings: () => void;
  onPublish: () => void;
}) {
  const openFileByPath = useOpenFileByPath();
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
      default:
        break; // new-item / add-image / add-media / add-photos render as derived buttons already
    }
  }, [action, onSettings, onPublish, openFileByPath]);

  return <ActionButton icon={action.icon} label={action.label} onClick={handle} />;
}

function useOpenFileByPath() {
  const openFile = useUIStore((s) => s.openFile);
  return useCallback(
    (path: string) => {
      const artifact = useCruxStore
        .getState()
        .artifacts.find((a) => ((a.meta?.path as string | undefined) || a.filename) === path);
      if (artifact) openFile(artifact.id, path);
    },
    [openFile],
  );
}

// ── Collection cards ─────────────────────────────────────────────────────────

function CollectionSection({ collection }: { collection: ContentCollection }) {
  const items = useCollectionItems(collection);
  const openFile = useUIStore((s) => s.openFile);
  const deleteArtifacts = useCruxStore((s) => s.deleteArtifacts);

  // Read frontmatter lazily per render from the store's cached content is not
  // available — items carry parsed data via readContent on demand instead.
  // For list purposes we parse from a small synchronous cache filled below.
  const sorted = useCollectionData(items, collection);

  return (
    <section>
      <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
        {collection.name} · {items.length}
      </h2>
      {sorted.length === 0 ? (
        <p className="text-xs text-text-muted">
          Nothing here yet — create your first {collection.singular.toLowerCase()} above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map(({ item, data }) => (
            <li
              key={item.artifact.id}
              className={cn(
                'group flex items-center gap-3 px-4 py-3 rounded-[var(--radius-sm)]',
                'bg-surface border border-border hover:border-accent/60 transition-colors',
              )}
            >
              <button
                onClick={() => openFile(item.artifact.id, item.path)}
                className="flex-1 text-left cursor-pointer min-w-0"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm text-text truncate">
                    {data.title || item.path.split('/').pop()}
                  </span>
                  {data.draft === 'true' && (
                    <span className="shrink-0 px-1.5 py-0.5 text-2xs rounded bg-border text-text-muted">
                      draft
                    </span>
                  )}
                </span>
                <span className="block text-xxs text-text-muted truncate mt-0.5">
                  {[data.date, data.description].filter(Boolean).join(' — ')}
                </span>
              </button>
              <button
                onClick={async () => {
                  if (
                    await confirmDialog({
                      message: `Delete "${data.title || item.path}"? It stays in history.`,
                      confirmLabel: 'Delete',
                      danger: true,
                    })
                  ) {
                    await deleteArtifacts([item.artifact.id]);
                  }
                }}
                className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs text-text-muted hover:text-error transition-opacity cursor-pointer px-1"
                title={`Delete ${collection.singular.toLowerCase()}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Parse frontmatter for each item (content fetched once per fingerprint). */
const fmCache = new Map<string, Record<string, string>>(); // fingerprint -> data

function useCollectionData(items: CollectionItem[], collection: ContentCollection) {
  const [parsed, setParsed] = useState<
    Array<{ item: CollectionItem; data: Record<string, string> }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { artifact: artifactService } = getServices();
      const results: Array<{ item: CollectionItem; data: Record<string, string> }> = [];
      for (const item of items) {
        const fp = item.artifact.fingerprint || item.artifact.id;
        let data = fmCache.get(fp);
        if (!data) {
          try {
            const content = await artifactService.readContent(item.artifact.id);
            data = parseFrontmatter(content).data;
            fmCache.set(fp, data);
            if (fmCache.size > 500) fmCache.clear();
          } catch {
            data = {};
          }
        }
        results.push({ item, data });
      }
      if (cancelled) return;
      const { field, dir } = collection.sort ?? { field: 'date', dir: 'desc' };
      results.sort((a, b) => {
        const av = a.data[field] ?? '';
        const bv = b.data[field] ?? '';
        return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
      setParsed(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [items, collection.sort]);

  return parsed;
}
