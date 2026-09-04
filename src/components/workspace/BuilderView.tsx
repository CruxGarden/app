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
import { mediaKindFor, isStreamingReady, mediaFileName } from '@/lib/media-kind';

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

/** Prefill the chat input and focus it (MessageInput listens). */
function promptAI(prompt: string) {
  window.dispatchEvent(new CustomEvent('crux:ai-prompt', { detail: { prompt } }));
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
            .filter((a) => a.do.type !== 'add-media')
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

        <p className="text-[10px] text-text-muted/60 text-center">
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
      let lastArtifact: Artifact | null = null;
      let lastPath = '';
      let converted = 0;
      try {
        for (const [i, file] of files.entries()) {
          const kind = mediaKindFor(file.type, file.name);
          if (!kind) continue;
          let publicName = mediaFileName(file.name);
          let toUpload: File = file;
          if (canTranscode && !isStreamingReady(file.type, file.name)) {
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
            if (out) {
              publicName = mediaFileName(out.name);
              toUpload = new File([new Uint8Array(out.data)], publicName, { type: out.mimeType });
              converted += 1;
            }
          }
          setStatus(`Adding ${publicName}…`);
          await uploadFile(toUpload, 'public/media');
          const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
          const vars = {
            slug: slugify(title),
            title,
            today: new Date().toISOString().slice(0, 10),
          };
          const frontmatter: Record<string, string> = {};
          for (const [key, value] of Object.entries(collection.new.frontmatter))
            frontmatter[key] = interpolate(value, vars);
          frontmatter.kind = kind;
          frontmatter.media = `/media/${publicName}`;
          lastPath = interpolate(collection.new.pathTemplate, vars);
          lastArtifact = await createFile(
            lastPath,
            serializeFrontmatter(frontmatter, collection.new.body ?? '\n'),
          );
        }
        if (lastArtifact) openFile(lastArtifact.id, lastPath);
        const skipped = files.filter((f) => !mediaKindFor(f.type, f.name)).length;
        void alertDialog(
          `Added ${files.length - skipped} item${files.length - skipped === 1 ? '' : 's'}` +
            (converted ? ` (${converted} converted for the web)` : '') +
            (skipped ? `; skipped ${skipped} non-media file${skipped === 1 ? '' : 's'}` : '') +
            '.',
          'Media added',
        );
      } catch (err) {
        void alertDialog('Adding media failed: ' + (err as Error).message, 'Add media');
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
      case 'ai':
        promptAI(action.do.prompt);
        break;
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
        break; // new-item / add-image / add-media render as derived buttons already
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
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-border text-text-muted">
                      draft
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-text-muted truncate mt-0.5">
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
