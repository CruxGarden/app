import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { searchMedia, addMedia, defaultFolder, type MediaItem, type MediaKind } from '@/services/media-finder';
import { PaneEmpty, PaneNote, PaneToolbar } from './pane-ui';
import { cn } from '@/lib/cn';

/**
 * Find media: openly licensed images, sounds and video from Openverse and
 * Wikimedia Commons, brought into this Crux with the license and the author
 * kept beside the file (media-origins/). No keys, no accounts.
 */
const KINDS: { kind: MediaKind; label: string }[] = [
  { kind: 'image', label: 'Images' },
  { kind: 'audio', label: 'Sounds' },
  { kind: 'video', label: 'Video' },
];
export default function MediaPane() {
  const crux = useCruxStore((s) => s.crux);
  const refreshArtifacts = useCruxStore((s) => s.refreshArtifacts);
  const [kind, setKind] = useState<MediaKind>('image');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const search = async () => {
    setError('');
    setStatus('');
    setBusy('search');
    try {
      setItems(await searchMedia(kind, query));
    } catch (err) {
      setItems(null);
      setError(err instanceof Error ? err.message : 'The search failed.');
    } finally {
      setBusy(null);
    }
  };
  const use = async (item: MediaItem) => {
    if (!crux) return;
    setError('');
    setBusy(item.id);
    setStatus(`Bringing in ${item.title}…`);
    try {
      const { path } = await addMedia(crux.id, item, folder.trim() || defaultFolder(kind));
      await refreshArtifacts();
      setStatus(`Added ${path} with its license and author beside it.`);
    } catch (err) {
      setStatus('');
      setError(err instanceof Error ? err.message : 'That file could not be added.');
    } finally {
      setBusy(null);
    }
  };

  if (!crux) return <PaneEmpty title="No Crux open" description="Open a Crux to bring media into it." />;
  return (
    <div className="flex flex-col h-full min-h-0">
      <PaneToolbar>
        <div role="tablist" aria-label="Media kind" className="flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              role="tab"
              aria-selected={kind === k.kind}
              className={cn('px-2 py-1 text-xs rounded-[var(--radius-sm)] border', kind === k.kind ? 'bg-accent/20 border-accent text-text' : 'border-border text-text-muted')}
              onClick={() => {
                setKind(k.kind);
                setItems(null);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </PaneToolbar>
      <form
        className="flex gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search media"
          placeholder={kind === 'image' ? 'Search images…' : kind === 'audio' ? 'Search sounds…' : 'Search video…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-2 h-8 text-sm rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text"
        />
        <button type="submit" disabled={busy === 'search' || !query.trim()} className="px-3 h-8 text-sm rounded-[var(--radius-sm)] border border-border text-text hover:bg-accent/20">
          {busy === 'search' ? 'Searching…' : 'Search'}
        </button>
      </form>
      <label className="flex items-center gap-2 px-3 pb-2 text-xs text-text-muted">
        Folder in this Crux
        <input
          aria-label="Destination folder"
          value={folder}
          placeholder={defaultFolder(kind)}
          onChange={(e) => setFolder(e.target.value)}
          className="flex-1 px-2 h-7 text-xs rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text"
        />
      </label>
      {status && (
        <p role="status" className="px-3 pb-2 text-xs text-text-muted">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="px-3 pb-2 text-xs text-error">
          {error}
        </p>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {items === null && !busy && (
          <PaneNote tone="muted">
            Openly licensed work from Openverse (images and sounds) and Wikimedia Commons (video). Each file arrives with its license, author and source kept beside it; check the license before you publish.
          </PaneNote>
        )}
        {items && !items.length && <PaneNote tone="muted">Nothing found. Try other words.</PaneNote>}
        {items && items.length > 0 && (
          <ul aria-label="Media results" className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={`${item.provider}:${item.id}`} className="flex gap-3 p-2 rounded-[var(--radius-sm)] border border-border bg-surface">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-16 h-16 object-cover rounded-[var(--radius-sm)] shrink-0 bg-surface-solid" />
                ) : (
                  <div className="w-16 h-16 rounded-[var(--radius-sm)] shrink-0 bg-surface-solid" aria-hidden="true" />
                )}
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium text-text truncate">{item.title}</p>
                  <p className="text-text-muted truncate">
                    {item.creator} · {item.license}
                    {item.licenseVersion ? ` ${item.licenseVersion}` : ''}
                    {item.duration ? ` · ${Math.round(item.duration / 1000)} s` : ''}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      className="px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-text hover:bg-accent/20"
                      disabled={busy !== null}
                      onClick={() => void use(item)}
                    >
                      {busy === item.id ? 'Adding…' : `Use ${item.title}`}
                    </button>
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="px-2 py-0.5 text-text-muted hover:text-text">
                      Source ↗
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
