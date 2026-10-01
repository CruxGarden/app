import { useCruxStoreApi } from '@/stores/cruxStore';
import { buttonClass } from '@/components/ui/button-class';
import { confirmAndDeleteArtifacts } from '@/components/artifacts/safeDelete';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCruxStore, selectHasUnpublishedChanges } from '@/stores/cruxStore';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { getServices } from '@/services';
import { cn } from '@/lib/cn';
import { publicCruxUrl } from '@/lib/public-url';
import { parseFrontmatter, slugify, globToRegex } from '@/lib/frontmatter';
import { Modal, Input, Button, Select, Textarea, SectionLabel } from '@/components/ui';
import type { ContentModel, ContentCollection, BuilderAction } from '@/templates';
import type { Artifact } from '@/api/types';
import { alertDialog } from '@/stores/dialogStore';
import { parseShelf, type ShelfEntry } from '@/game/shelf';
import { HIDDEN_KINDS, type HiddenKind } from '@/game/hidden';
import { shelfPathOf, useShelf } from './useShelf';
import {
  ActionButton,
  NewItemButton,
  AddImageButton,
  AddPhotosButton,
  AddMediaButton,
  CustomAction,
} from './builder-actions';

/** Action types the Builder renders from dedicated components, not CustomAction. */
const DERIVED_ACTIONS = new Set<BuilderAction['do']['type']>([
  'new-item',
  'add-image',
  'add-media',
  'add-photos',
  'add-shelf-entry',
]);

/** Paths of every artifact in the crux (meta.path, falling back to filename). */

/** An item's label: its title, or the first declared field (a product's `name`, a shelf entry's `question`). */
function itemLabel(data: Record<string, string>, collection: ContentCollection): string {
  return data.title || (collection.fields[0] ? data[collection.fields[0].key] : '') || '';
}

/** Filenames already present under `folder` (e.g. 'public/images'). */

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
  // `meta.game.shelfPath` is what marks a crux interrogable (ADR 0016)
  const shelfPath = shelfPathOf(crux.meta as Record<string, unknown> | undefined);

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
            <button onClick={openPublish} className={buttonClass('primary', 'sm', 'ml-auto')}>
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
            .filter((a) => a.do.type === 'add-shelf-entry')
            .map((a) => (
              <AddToShelfButton
                key={a.label}
                path={(a.do as { path: string }).path}
                label={a.label}
                icon={a.icon}
              />
            ))}
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

        {/* ── The Shelf (Interrogable Crux, ADR 0016) ── */}
        {shelfPath && <ShelfSection path={shelfPath} />}

        {/* ── Collections ── */}
        {model.collections.map((collection) => (
          <CollectionSection key={collection.name} collection={collection} />
        ))}

        <p className="text-2xs text-subtle text-center">
          This is a real Astro project — open the Artifacts panel to work with the files directly.
        </p>
      </div>
    </div>
  );
}
function CollectionSection({ collection }: { collection: ContentCollection }) {
  const items = useCollectionItems(collection);
  const openFile = useUIStore((s) => s.openFile);
  const cruxStore = useCruxStoreApi();

  // Read frontmatter lazily per render from the store's cached content is not
  // available — items carry parsed data via readContent on demand instead.
  // For list purposes we parse from a small synchronous cache filled below.
  const sorted = useCollectionData(items, collection);

  return (
    <section>
      <SectionLabel as="h2" tone="muted" className="mb-3">
        {collection.name} · {items.length}
      </SectionLabel>
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
                'bg-surface border border-border hover:border-accent/60 hover:bg-action-button-hover transition-colors',
              )}
            >
              <button
                onClick={() => openFile(item.artifact.id, item.path)}
                className="flex-1 text-left cursor-pointer min-w-0"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm text-text truncate">
                    {itemLabel(data, collection) || item.path.split('/').pop()}
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
                  await confirmAndDeleteArtifacts(
                    cruxStore,
                    [item.artifact.id],
                    `Delete "${itemLabel(data, collection) || item.path}"?`,
                  );
                }}
                className="shrink-0 opacity-0 group-hover:opacity-[var(--secondary-action-opacity)] hover:!opacity-100 text-xs text-text-muted hover:text-error transition-opacity cursor-pointer px-1"
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
            const content = await artifactService.readContent(item.artifact);
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

function ShelfSection({ path }: { path: string }) {
  const { shelf, error, artifact } = useShelf(path);
  const openFile = useUIStore((s) => s.openFile);
  return (
    <section data-testid="shelf-section">
      <SectionLabel as="h2" tone="muted" className="mb-1">
        Shelf{shelf ? ` · ${shelf.entries.length}` : ''}
      </SectionLabel>
      {shelf && (
        <p className="text-xs text-text-muted mb-3">
          <span className="text-text">{shelf.title}</span> — {shelf.question}
          {shelf.description ? ` · ${shelf.description}` : ''}
        </p>
      )}
      {!artifact ? (
        <p className="text-xs text-text-muted">No shelf at {path} yet.</p>
      ) : error ? (
        <p className="text-xs text-error">
          {path} does not parse: {error}
        </p>
      ) : shelf ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {shelf.entries.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 text-sm"
              data-testid="shelf-entry"
            >
              <span className="text-text truncate">{e.name}</span>
              <span className="shrink-0 text-xxs text-text-muted">
                {e.kind}
                {e.era ? ` · ${e.era}` : ''}
                {e.provenance === 'unsourced' ? ' · unsourced' : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {artifact && (
        <button
          onClick={() => openFile(artifact.id, path)}
          className="mt-3 text-xxs text-text-muted hover:text-accent cursor-pointer"
        >
          Edit {path} directly
        </button>
      )}
    </section>
  );
}

const EMPTY_ENTRY = {
  name: '',
  aliases: '',
  kind: 'person' as HiddenKind,
  era: '',
  voiceNote: '',
  provenance: 'sourced' as ShelfEntry['provenance'],
  sources: '',
};

/** "Add to shelf": a form that appends one entry to the Shelf file — the same shape the skill describes. */
function AddToShelfButton({ path, label, icon }: { path: string; label: string; icon?: string }) {
  const { shelf, artifact } = useShelf(path);
  const saveArtifactContent = useCruxStore((s) => s.saveArtifactContent);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_ENTRY);
  const set =
    (key: keyof typeof EMPTY_ENTRY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const splitList = (raw: string, sep: RegExp) =>
    raw
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleAdd = useCallback(async () => {
    if (!artifact || !shelf || saving) return;
    const name = form.name.trim();
    if (!name) return;
    const sources = splitList(form.sources, /\r?\n|,\s+/);
    if (form.provenance === 'sourced' && sources.length === 0) {
      await alertDialog('A sourced entry needs at least one source URL — or mark it unsourced.');
      return;
    }
    const id = slugify(name);
    if (shelf.entries.some((e) => e.id === id)) {
      await alertDialog(`"${name}" is already on the shelf.`);
      return;
    }
    const entry: ShelfEntry = {
      id,
      name,
      aliases: splitList(form.aliases, /,|\r?\n/),
      kind: form.kind,
      ...(form.era.trim() ? { era: form.era.trim() } : {}),
      ...(form.voiceNote.trim() ? { voiceNote: form.voiceNote.trim() } : {}),
      provenance: form.provenance,
      ...(sources.length ? { sources } : {}),
    };
    setSaving(true);
    try {
      // Re-read at save time so a concurrent edit is not clobbered
      const current = parseShelf(await getServices().artifact.readContent(artifact));
      const next = { ...current, entries: [...current.entries, entry] };
      await saveArtifactContent(artifact.id, JSON.stringify(next, null, 2) + '\n');
      setOpen(false);
      setForm(EMPTY_ENTRY);
    } catch (err) {
      await alertDialog(`Could not add to the shelf: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [artifact, shelf, saving, form, saveArtifactContent]);

  if (!artifact) return null;
  return (
    <>
      <ActionButton icon={icon ?? '📚'} label={label} onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title={label}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <Input autoFocus value={form.name} onChange={set('name')} placeholder="Name" />
          <Input
            value={form.aliases}
            onChange={set('aliases')}
            placeholder="Aliases, comma-separated (variants, spellings, titles)"
          />
          <div className="flex gap-2">
            <Select value={form.kind} onChange={set('kind')} fieldSize="sm" aria-label="Kind">
              {HIDDEN_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Input value={form.era} onChange={set('era')} placeholder="Era — c. 355–415" />
          </div>
          <Textarea
            value={form.voiceNote}
            onChange={set('voiceNote')}
            placeholder="Voice note — one line: temperament, and how they deflect"
            rows={2}
            fieldSize="sm"
          />
          <Select
            value={form.provenance}
            onChange={set('provenance')}
            fieldSize="sm"
            aria-label="Provenance"
          >
            <option value="sourced">sourced — facts can be checked against the pages below</option>
            <option value="unsourced">unsourced — spoken from what is commonly told</option>
          </Select>
          <Textarea
            value={form.sources}
            onChange={set('sources')}
            placeholder="Sources — one URL per line"
            rows={2}
            fieldSize="sm"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!form.name.trim()} loading={saving}>
              Add
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
