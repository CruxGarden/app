import { choiceDialog, confirmDialog } from '@/stores/dialogStore';
import { installUpdate, useUpdateNotices } from '@/services/update-notices';
import { assertAuthCurrent, captureAuth } from '@/api/session';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { captureGardenId, useGardenContext } from '@/stores/gardenContext';
import { linkClass } from '@/components/ui/button-class';
import { downloadBlob } from '@/lib/download';
import { getSqliteClient } from '@/services/sqlite/client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button, SectionLabel } from '@/components/ui';
import { ExportIcon, ShareIcon, CloseIcon } from '@/components/ui/icons';
import { getSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useAppStore } from '@/stores/appStore';
import { BUNDLED_MOODS, SHELVED_MOODS } from '@/lib/moods/bundled-moods';
import MaterialMoods from './MaterialMoods';
import { materialChoice } from '@/lib/moods/material';
import { GARDEN_DARK } from '@/lib/moods';
import { chooseMood, onGardenMoodChange } from '@/services/garden-mood';
import {
  captureCurrentMood,
  deleteMood,
  exportMoodPackage,
  getInstalledMoods,
  refreshInstalledMoods,
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
    <div
      className="w-full h-full flex flex-col"
      style={{
        backgroundColor: c('bg'),
        backgroundImage: o.workspaceTexture,
        backgroundSize: o.workspaceTextureSize,
      }}
    >
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
        {['paneWorkshop', 'paneArtifacts'].map((pane, index) => (
          <div
            key={pane}
            className={index === 0 ? 'flex-1 overflow-hidden' : 'w-1/3 overflow-hidden'}
            style={{
              background: c('panel'),
              border: `1px solid ${c('border')}`,
              borderRadius: o.cardRadius ?? '2px',
              boxShadow: o.elevationPane ?? 'none',
            }}
          >
            <div
              className="h-3 m-1 rounded-[2px]"
              style={{ background: o[`${pane}Header`] ?? c(pane) }}
            />
            <div
              className="h-1 m-2 w-1/2 opacity-[var(--decoration-opacity)]"
              style={{ background: c('textMuted') }}
            />
            <div
              className="h-1 mx-2 w-1/3 opacity-[var(--decoration-opacity)]"
              style={{ background: c('textMuted') }}
            />
          </div>
        ))}
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
  onUnshare,
  onDelete,
  onUpdate,
  canPublish,
  testId,
}: {
  pkg: MoodPackage;
  /** Its creator shared a newer edition; installs only when pressed. */
  onUpdate?: () => void;
  worn: boolean;
  busy: boolean;
  onApply: () => void;
  onExport: () => void;
  onPublish?: () => void;
  onUnshare?: () => void;
  onDelete?: () => void;
  canPublish?: boolean;
  testId: string;
}) {
  const aiEnabled = useAiEnabled();
  const meta = [
    pkg.theme.section,
    pkg.sound.synth?.name ?? 'Crux Synth',
    aiEnabled && pkg.persona ? pkg.persona.name : pkg.author ? `by ${pkg.author}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const iconBtn =
    'w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text hover:bg-action-button-hover active-dim motion-press cursor-pointer disabled:cursor-not-allowed';
  return (
    <div
      className={cn(
        'group shape-card rounded-[var(--radius)] border bg-panel overflow-hidden flex flex-col transition-[border-color,box-shadow] motion-enter-card',
        worn
          ? 'border-accent/(--tint-medium)'
          : 'border-border hover:border-accent/(--tint-muted) hover:shadow-card-hover',
        busy && 'opacity-[var(--busy-opacity)]',
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
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-black/(--tint-soft)">
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
          {onUpdate && (
            <button
              type="button"
              onClick={onUpdate}
              disabled={busy}
              data-testid="mood-install-update"
              className="text-2xs font-mono text-accent hover:underline cursor-pointer disabled:cursor-wait"
            >
              Install update
            </button>
          )}
        </div>
        <div className="flex items-center shrink-0 opacity-[var(--secondary-action-opacity)] group-hover:opacity-100 transition-opacity">
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
                  ? pkg.publishedAt
                    ? 'Share the update on crux.garden'
                    : 'Share on crux.garden'
                  : 'Connect your account (Settings) to share'
              }
              aria-label={`${pkg.publishedAt ? 'Share update of' : 'Share'} ${pkg.name}`}
              className={iconBtn}
            >
              <ShareIcon size={13} />
            </button>
          )}
          {onUnshare && pkg.publishedAt && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onUnshare}
              disabled={busy || !canPublish}
              aria-label={`Unshare ${pkg.name}`}
            >
              Unshare
            </Button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy || worn}
              aria-label={`Delete Mood ${pkg.name}`}
              title={
                worn
                  ? 'Worn here — wear another Mood to delete this one'
                  : 'Delete from this Garden only; the public edition stays shared'
              }
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

/** The HyperMoods: every bundled room that is not a material Mood (Plasma itself counts as one). */
const HYPER_MOODS = BUNDLED_MOODS.filter((m) => m.id !== 'plasma' && !materialChoice(m.id));

export default function MoodBrowser() {
  const aiEnabled = useAiEnabled();
  const wearing = aiEnabled
    ? 'theme, background, persona and soundscape'
    : 'theme, background and soundscape';
  const [moods, setMoods] = useState<MoodPackage[]>(() => getInstalledMoods());
  const gardenId = useGardenContext((s) => s.garden?.id);
  // A new root (startup, profile replacement) starts a new library epoch.
  const root = useGardenContext((s) => s.root);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => onMoodPackagesChange(() => setMoods(getInstalledMoods())), []);
  useEffect(
    () =>
      getSqliteClient().onChange?.((change) => {
        if (
          change.entity === 'crux-lifecycle' ||
          change.entity === 'garden-membership' ||
          (change.entity === 'crux' &&
            change.fields?.some((field) => field === 'fileContent' || field === 'title'))
        )
          setReload((value) => value + 1);
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    setMoods(getInstalledMoods());
    void refreshInstalledMoods(gardenId)
      .then((packages) => {
        if (active) {
          setMoods(packages);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load Moods.');
      });
    return () => {
      active = false;
    };
  }, [gardenId, root, reload]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const doPublish = async (pkg: MoodPackage) => {
    const authContext = captureAuth();
    // Like a Crux, a Mood can be listed in Explore or shared by link only.
    const answer = await choiceDialog({
      title: pkg.publishedAt ? `Share the update of ${pkg.name}` : `Share ${pkg.name}`,
      message:
        'Anyone with the link can install it. Discoverable Moods are also listed in Explore → Moods.',
      choices: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        { id: 'share', label: 'Share' },
      ],
      checkbox: { label: 'Discoverable — list it in Explore', checked: true },
    });
    if (answer.choice !== 'share') return;
    const discoverable = answer.checked;
    setBusy(pkg.id);
    try {
      const [{ publishMood }, { getServices }, { readBlob }, { publishPipeline }] =
        await Promise.all([
          import('@/lib/moods/publish-mood'),
          import('@/services'),
          import('@/services/blobs'),
          import('@/services/publish'),
        ]);
      assertAuthCurrent(authContext);
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
        discoverable,
        publish: (crux, artifacts) => publishPipeline(crux, artifacts as never, { authContext }),
      });
      say(
        discoverable
          ? `Shared "${published.name}" — it's on crux.garden and in Explore → Moods.`
          : `Shared "${published.name}" by link only — it's on crux.garden, not listed in Explore.`,
      );
    } catch (err) {
      say(err instanceof Error ? `Sharing failed: ${err.message}` : 'Sharing failed');
    } finally {
      setBusy(null);
    }
  };
  const updates = useUpdateNotices().filter((notice) => notice.kind === 'mood');
  const doUpdate = async (pkg: MoodPackage) => {
    const notice = updates.find((item) => item.id === pkg.id);
    if (!notice) return;
    setBusy(pkg.id);
    try {
      await installUpdate(notice);
      say(`Updated "${pkg.name}".`);
    } catch (err) {
      say(err instanceof Error ? `Update failed: ${err.message}` : 'Update failed. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const doUnshare = async (pkg: MoodPackage) => {
    const authContext = captureAuth();
    if (
      !(await confirmDialog({
        title: `Unshare ${pkg.name}?`,
        message:
          'Remove this Mood from your public Garden, Explore and its shared link. Your saved Mood and its assets stay here. Downloaded copies belong to their recipients.',
        confirmLabel: 'Unshare',
        danger: true,
      }))
    )
      return;
    setBusy(pkg.id);
    try {
      const [{ unshareMood }, { getServices }, { unpublishPipeline }] = await Promise.all([
        import('@/lib/moods/unshare-mood'),
        import('@/services'),
        import('@/services/publish'),
      ]);
      assertAuthCurrent(authContext);
      await unshareMood(pkg, {
        findCrux: (id) => getServices().crux.findById(id),
        unpublish: (crux) => unpublishPipeline(crux, { authContext }),
      });
      say(`Unshared "${pkg.name}". Your saved Mood is still here.`);
    } catch (error) {
      say(
        error instanceof Error ? `Unshare failed: ${error.message}` : 'Unshare failed. Try again.',
      );
    } finally {
      setBusy(null);
    }
  };
  const say = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 4000);
  };

  const saveCurrent = async () => {
    const author = useAppStore.getState().author?.username;
    const captured = captureCurrentMood({ name, author });
    const owner = captureGardenId();
    setBusy('save');
    try {
      const pkg = await installMood(captured, { gardenId: owner });
      setSaving(false);
      setName('');
      say(`Saved "${pkg.name}" — ${wearing}.`);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Could not save this Mood. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const [wornId, setWornId] = useState<string | null>(() => getSetting(SettingsKey.WornMoodId));
  useEffect(() => {
    const changed = () => setWornId(getSetting(SettingsKey.WornMoodId));
    document.addEventListener('mood-worn', changed);
    const off = onGardenMoodChange(changed);
    return () => {
      document.removeEventListener('mood-worn', changed);
      off();
    };
  }, []);
  const doApply = async (pkg: MoodPackage) => {
    setBusy(pkg.id);
    try {
      await chooseMood(pkg);
      setWornId(getSetting(SettingsKey.WornMoodId));
      // Where Gardens own their Mood, the Garden Mood line already says so.
      if (!getSqliteClient().gardenMood) say(`Now wearing "${pkg.name}".`);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Could not wear this Mood.');
    } finally {
      setBusy(null);
    }
  };

  const doExport = async (pkg: MoodPackage) => {
    setBusy(pkg.id);
    try {
      const { readBlob } = await import('@/services/blobs');
      const blob = await exportMoodPackage(pkg, readBlob);
      downloadBlob(blob, `${pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.cruxmood`);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Could not export this Mood.');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    const owner = captureGardenId();
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
      await installMood(pkg, { gardenId: owner });
      say(`Imported "${pkg.name}". Apply it when you like.`);
    } catch {
      say('Could not import this Mood. The file may be damaged or incomplete. Try another copy.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <div role="alert" className="text-sm text-error">
          {loadError}{' '}
          <button
            type="button"
            className={linkClass()}
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-text-muted flex-1 min-w-[200px]">
          A Mood is everything you're wearing — {wearing} — as one shareable package.
        </p>
        {saving ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void saveCurrent();
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
            <Button size="sm" type="submit" disabled={!!busy}>
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

      {/* Material Moods: three choices and two switches (MaterialMoods). */}
      <MaterialMoods wornId={wornId} busy={busy !== null} onWear={doApply} />

      {/* HyperMoods: the rooms with their own render, track, cues and effects. */}
      <section className="flex flex-col gap-2" data-testid="bundled-moods">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel as="h3">HyperMoods</SectionLabel>
          <span className="text-2xs text-text-muted text-right">
            {HYPER_MOODS.length} Moods — color, texture and sound, made as one. Click one to wear
            it.
          </span>
        </div>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {HYPER_MOODS.map((pkg) => (
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
      </section>

      {/* The shelf: the Office study, still here, not what the app leads with. */}
      <details className="mt-2" data-testid="shelved-moods">
        <summary className="cursor-pointer text-xxs font-mono uppercase tracking-wider text-caption hover:text-text">
          Shelved · {SHELVED_MOODS.length} earlier rooms
        </summary>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] mt-2">
          {SHELVED_MOODS.map((pkg) => (
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
      </details>

      <section className="flex flex-col gap-2">
        <SectionLabel as="h3" className="mt-3">
          Yours
          {updates.length > 0 && (
            <span className="ml-2 normal-case tracking-normal text-accent" data-testid="mood-updates">
              {updates.length} update{updates.length === 1 ? '' : 's'}
            </span>
          )}
        </SectionLabel>
      </section>

      {moods.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-border/(--tint-strong) p-8 text-center">
          <p className="text-sm text-heading">No saved Moods yet</p>
          <p className="text-xs text-text-muted mt-1">
            Shape the app in Theme, Background, Sound{aiEnabled ? ' and Persona' : ''}, then save
            what you're wearing. Or import a .cruxmood someone sent you.
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
              onUnshare={() => void doUnshare(pkg)}
              onUpdate={
                updates.some((item) => item.id === pkg.id) ? () => void doUpdate(pkg) : undefined
              }
              canPublish={isAuthenticated}
              onDelete={() => {
                void (async () => {
                  if (
                    !(await confirmDialog({
                      title: `Delete Mood ${pkg.name}?`,
                      message:
                        'Delete this saved Mood from your Garden. Its public edition stays shared; use Unshare first if you want to remove that too.',
                      confirmLabel: 'Delete locally',
                      danger: true,
                    }))
                  )
                    return;
                  setBusy(pkg.id);
                  void deleteMood(pkg.id)
                    .catch((error) =>
                      say(error instanceof Error ? error.message : 'Could not delete this Mood.'),
                    )
                    .finally(() => setBusy(null));
                })();
              }}
              testId={`mood-${pkg.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
