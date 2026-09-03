import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import type { ExploreCrux } from '@/api/public';
import type { MoodSummary } from '@/lib/moods/publish-mood';
import { publishBaseUrlFor } from '@/lib/public-url';

/** A published Mood in Explore: swatch, facts, Install / Wear it (inside the app). */
export default function MoodResultCard({
  crux,
  canInstall,
  onOpen,
  onInstall,
}: {
  crux: ExploreCrux;
  canInstall: boolean;
  onOpen: () => void;
  onInstall: (apply: boolean) => Promise<void>;
}) {
  const s = (crux.meta?.mood ?? null) as MoodSummary | null;
  const sw = s?.swatch ?? {};
  const c = (k: string, d = '#888') => sw[k] || d;
  const [busy, setBusy] = useState<'install' | 'apply' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = s?.cover && !coverFailed ? `${publishBaseUrlFor(crux.id)}/${s.cover}` : null;
  const run = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'install');
    try {
      await onInstall(apply);
      setDone(apply ? 'Wearing it' : 'Installed');
    } catch (err) {
      setDone(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div
      className="rounded-[var(--radius)] border border-border bg-panel overflow-hidden flex flex-col"
      data-testid={`explore-mood-${crux.id}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="text-left cursor-pointer"
        aria-label={`Open ${crux.title || crux.slug}`}
      >
        {coverUrl ? (
          <div
            className="aspect-[16/9] w-full overflow-hidden"
            style={{ background: c('bg', '#111') }}
          >
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setCoverFailed(true)}
              draggable={false}
            />
          </div>
        ) : (
          <div
            className="aspect-[16/9] w-full flex flex-col"
            style={{ background: c('bg', '#111') }}
          >
            <div
              className="h-4 flex items-center px-2 gap-1"
              style={{
                background: c('surface', '#222'),
                borderBottom: `1px solid ${c('border', '#333')}`,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: c('accent') }} />
              <span className="flex-1" />
              {['paneCollaboration', 'paneArtifacts', 'paneWorkshop', 'paneDetails'].map((k) => (
                <span key={k} className="w-2.5 h-2.5 rounded-[2px]" style={{ background: c(k) }} />
              ))}
            </div>
            <div className="flex-1 flex gap-1.5 p-2">
              <div className="flex-1 rounded-[3px]" style={{ background: c('panel', '#1a1a1a') }} />
              <div className="w-1/3 rounded-[3px]" style={{ background: c('panel', '#1a1a1a') }} />
            </div>
          </div>
        )}
      </button>
      <div className="p-3 flex flex-col gap-1.5">
        <div className="min-w-0">
          <div className="font-display text-sm text-heading truncate">
            {crux.title || crux.slug}
          </div>
          <div className="text-[10px] font-mono text-text-muted truncate">
            Mood · {s?.section ?? '—'} · {s?.mixes ?? 0} mix{s?.mixes === 1 ? '' : 'es'} ·{' '}
            {s?.layers ?? 0} layer
            {s?.layers === 1 ? '' : 's'} · by {crux.author_username}
          </div>
        </div>
        {s?.layerTypes?.length ? (
          <div className="flex flex-wrap gap-1">
            {s.layerTypes.map((t) => (
              <span
                key={t}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-badge text-badge-text border border-badge-border"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
        {canInstall && (
          <div className="flex items-center gap-1.5 pt-1">
            <Button size="sm" onClick={() => void run(true)} disabled={busy !== null}>
              {busy === 'apply' ? 'Applying…' : 'Wear it'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void run(false)}
              disabled={busy !== null}
            >
              {busy === 'install' ? 'Installing…' : 'Install'}
            </Button>
            {done && (
              <span
                className={cn(
                  'text-[11px] ml-auto',
                  done === 'Failed' ? 'text-error' : 'text-accent',
                )}
              >
                {done}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
