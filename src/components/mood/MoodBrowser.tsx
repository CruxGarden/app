import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import { ExportIcon, ShareIcon, CloseIcon } from '@/components/ui/icons';
import { getSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useAppStore } from '@/stores/appStore';
import { BUNDLED_MOODS } from '@/lib/moods/bundled-moods';
import { GARDEN_DARK } from '@/lib/moods';
import {
  applyMood,
  captureCurrentMood,
  deleteMood,
  exportMoodPackage,
  getInstalledMoods,
  importMoodPackage,
  installMood,
  onMoodPackagesChange,
  type MoodPackage,
} from '@/lib/moods/packages';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { formatDate } from '@/lib/format';

/**
 * The Mood Browser: your installed Moods — apply, export, delete — plus
 * "save what I'm wearing" and import. A Mood is theme + background + persona
 * + soundscape in one package (.cruxmood).
 */

function Swatch({ pkg }: { pkg: MoodPackage }) {
  const o = pkg.theme.overrides;
  const g = GARDEN_DARK as Record<string, string>;
  const c = (k: string) => o[k] || g[k] || '#888';
  const coverUrl = useBlobUrl(pkg.cover);
  if (coverUrl) {
    return <img src={coverUrl} alt="" className="w-full h-full object-cover" draggable={false} />;
  }
  return (
    <div className="w-full h-full flex flex-col" style={{ background: c('bg') }}>
      <div
        className="h-3 flex items-center px-1.5 gap-0.5"
        style={{ background: c('surface'), borderBottom: `1px solid ${c('border')}` }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c('accent') }} />
        <span className="flex-1" />
        {['paneCollaboration', 'paneArtifacts', 'paneWorkshop', 'paneDetails'].map((k) => (
          <span key={k} className="w-2 h-2 rounded-[1px]" style={{ background: c(k) }} />
        ))}
      </div>
      <div className="flex-1 flex gap-1 p-1.5">
        <div className="flex-1 rounded-[2px]" style={{ background: c('panel') }} />
        <div className="w-1/3 rounded-[2px]" style={{ background: c('panel') }} />
      </div>
    </div>
  );
}

/**
 * One Mood as a card. The picture is the action: click it to wear the Mood
 * (a "Wear" pill appears on hover; the worn one says so). Secondary actions —
 * export, publish, delete — sit as small icon buttons in the footer and only
 * come forward on hover, so the grid reads as rooms, not as rows of buttons.
 */
function MoodCard({
  pkg,
  worn,
  busy,
  onApply,
  onExport,
  onPublish,
  onDelete,
  canPublish,
  testId,
}: {
  pkg: MoodPackage;
  worn: boolean;
  busy: boolean;
  onApply: () => void;
  onExport: () => void;
  onPublish?: () => void;
  onDelete?: () => void;
  canPublish?: boolean;
  testId: string;
}) {
  const meta = [
    pkg.theme.section,
    pkg.bundled?.track?.name ?? pkg.sound.track?.name ?? 'no sound',
    pkg.persona ? pkg.persona.name : pkg.author ? `by ${pkg.author}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const iconBtn =
    'w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div
      className={cn(
        'group shape-card rounded-[var(--radius)] border bg-panel overflow-hidden flex flex-col transition-colors',
        worn ? 'border-accent/60' : 'border-border hover:border-accent/40',
        busy && 'opacity-70',
      )}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onApply}
        disabled={busy}
        aria-label={`Apply ${pkg.name}`}
        aria-pressed={worn}
        className="relative block aspect-[16/10] w-full overflow-hidden border-b border-border cursor-pointer disabled:cursor-wait text-left"
      >
        <div className="w-full h-full transition-transform duration-300 group-hover:scale-[1.03]">
          <Swatch pkg={pkg} />
        </div>
        {worn ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-overlay-badge backdrop-blur-sm px-2 py-0.5 text-2xs font-mono text-overlay-badge-text">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Wearing
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-black/25">
            <span className="rounded-full bg-primary-button text-primary-button-text px-3 py-1 text-xs font-medium shadow-card">
              Wear this Mood
            </span>
          </span>
        )}
      </button>
      <div className="px-2.5 py-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-display text-heading truncate">{pkg.name}</div>
          <div className="text-2xs font-mono text-text-muted truncate">{meta}</div>
          {pkg.publishedAt && (
            <div className="text-2xs font-mono text-accent truncate">
              Published {formatDate(pkg.publishedAt)}
            </div>
          )}
        </div>
        <div className="flex items-center shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onExport}
            disabled={busy}
            aria-label={`Export ${pkg.name}`}
            title="Export as .cruxmood"
            className={iconBtn}
          >
            <ExportIcon size={13} />
          </button>
          {onPublish && (
            <button
              type="button"
              onClick={onPublish}
              disabled={busy || !canPublish}
              title={
                canPublish
                  ? pkg.publishedCruxId
                    ? 'Republish to crux.garden'
                    : 'Publish to crux.garden'
                  : 'Connect your account (Settings) to publish'
              }
              aria-label={`${pkg.publishedCruxId ? 'Republish' : 'Publish'} ${pkg.name}`}
              className={iconBtn}
            >
              <ShareIcon size={13} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete Mood ${pkg.name}`}
              title="Delete"
              className={cn(iconBtn, 'hover:text-error')}
            >
              <CloseIcon size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MoodBrowser() {
  const [moods, setMoods] = useState<MoodPackage[]>(() => getInstalledMoods());
  useEffect(() => onMoodPackagesChange(() => setMoods(getInstalledMoods())), []);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const doPublish = async (pkg: MoodPackage) => {
    setBusy(pkg.id);
    try {
      const [{ publishMood }, { getServices }, { readBlob }, { publishPipeline }] =
        await Promise.all([
          import('@/lib/moods/publish-mood'),
          import('@/services'),
          import('@/services/blobs'),
          import('@/services/publish'),
        ]);
      const published = await publishMood(pkg, {
        services: async () => {
          const svc = getServices();
          return {
            crux: {
              create: (input) => svc.crux.create(input as never),
              update: (id, updates) => svc.crux.update(id, updates as never),
              findById: (id) => svc.crux.findById(id),
            },
            artifact: {
              findByResource: (type, id) => svc.artifact.findByResource(type, id),
              create: (input) => svc.artifact.create(input as never),
              upload: (input) => svc.artifact.upload(input as never),
              delete: (id) => svc.artifact.delete(id),
            },
          };
        },
        readBlob,
        publish: (crux, artifacts) => publishPipeline(crux, artifacts as never),
      });
      say(`Published "${published.name}" — it's on crux.garden and in Explore → Moods.`);
    } catch (err) {
      say(err instanceof Error ? `Publish failed: ${err.message}` : 'Publish failed');
    } finally {
      setBusy(null);
    }
  };
  const say = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 4000);
  };

  const saveCurrent = () => {
    const author = useAppStore.getState().author?.username;
    const pkg = installMood(captureCurrentMood({ name, author }));
    setSaving(false);
    setName('');
    say(`Saved "${pkg.name}" — theme, background, persona and soundscape.`);
  };

  const [wornId, setWornId] = useState<string | null>(() => getSetting(SettingsKey.WornMoodId));
  const doApply = async (pkg: MoodPackage) => {
    setBusy(pkg.id);
    try {
      await applyMood(pkg);
      setWornId(pkg.id);
      say(`Now wearing "${pkg.name}".`);
    } finally {
      setBusy(null);
    }
  };

  const doExport = async (pkg: MoodPackage) => {
    setBusy(pkg.id);
    try {
      const { readBlob } = await import('@/services/blobs');
      const blob = await exportMoodPackage(pkg, readBlob);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.cruxmood`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy('import');
    try {
      const { putBlob } = await import('@/services/blobs');
      let pkg: MoodPackage | null = null;
      if (file.name.endsWith('.json')) {
        // A bare theme file → a Mood wearing it over the current everything-else
        const { parseThemeFile } = await import('@/lib/moods/user-presets');
        const t = parseThemeFile(await file.text());
        if (t) {
          pkg = captureCurrentMood({
            name: t.name ?? file.name.replace(/\.[^.]+$/, ''),
            author: t.author,
          });
          pkg.theme = {
            ...pkg.theme,
            name: t.name ?? pkg.theme.name,
            section: t.section ?? pkg.theme.section,
            overrides: t.overrides,
          };
        }
      } else {
        pkg = await importMoodPackage(file, putBlob);
      }
      if (!pkg) return say('That file is not a Mood.');
      installMood(pkg);
      say(`Imported "${pkg.name}". Apply it when you like.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-text-muted flex-1 min-w-[200px]">
          A Mood is everything you're wearing — theme, background, persona, soundscape — as one
          shareable package.
        </p>
        {saving ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveCurrent();
            }}
          >
            <input
              autoFocus
              aria-label="Mood name"
              placeholder="Name this Mood…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSaving(false)}
              className="h-8 w-44 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-input-border-active"
            />
            <Button size="sm" type="submit">
              Save
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button size="sm" onClick={() => setSaving(true)}>
            Save current as Mood
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy === 'import'}
        >
          Import…
        </Button>
        <Button variant="ghost" size="sm" onClick={() => useUIStore.getState().openExplore('mood')}>
          Browse shared Moods
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".cruxmood,.zip,.json,application/zip,application/json"
          className="hidden"
          aria-label="Import a Mood file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void doImport(f);
          }}
        />
      </div>

      {note && (
        <p role="status" className="text-xxs text-accent">
          {note}
        </p>
      )}

      <section className="flex flex-col gap-2" data-testid="bundled-moods">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xxs font-mono uppercase tracking-wider text-caption">Built in</h3>
          <span className="text-2xs text-text-muted">
            {BUNDLED_MOODS.length} rooms — look, sound and voice change together. Click one to wear
            it.
          </span>
        </div>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {BUNDLED_MOODS.map((pkg) => (
            <MoodCard
              key={pkg.id}
              pkg={pkg}
              worn={wornId === pkg.id}
              busy={busy === pkg.id}
              onApply={() => void doApply(pkg)}
              onExport={() => void doExport(pkg)}
              testId={`bundled-${pkg.id}`}
            />
          ))}
        </div>
        <h3 className="text-xxs font-mono uppercase tracking-wider text-caption mt-3">Yours</h3>
      </section>

      {moods.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-border/70 p-8 text-center">
          <p className="text-sm text-heading">No saved Moods yet</p>
          <p className="text-xs text-text-muted mt-1">
            Shape the app in the Mood Builder, then save what you're wearing. Or import a .cruxmood
            someone sent you.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {moods.map((pkg) => (
            <MoodCard
              key={pkg.id}
              pkg={pkg}
              worn={wornId === pkg.id}
              busy={busy === pkg.id}
              onApply={() => void doApply(pkg)}
              onExport={() => void doExport(pkg)}
              onPublish={() => void doPublish(pkg)}
              canPublish={isAuthenticated}
              onDelete={() => deleteMood(pkg.id)}
              testId={`mood-${pkg.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
