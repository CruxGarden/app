import { showBackgroundFallback } from '@/services/background';
import { isPublicSite } from '@/lib/site';
import BackButton from '@/components/gateway/BackButton';
import { useState, useRef, useCallback, useEffect } from 'react';
import { applyMood, type MoodPackage } from '@/lib/moods/packages';
import { TeaserMaterial, TeaserPanel, TeaserBrand } from '@/components/landing/TeaserMaterial';
import PlasmaSurfaces from '@/components/plasma/PlasmaSurfaces';
import '@/components/landing/teaser.css';
import Draggable from '@/components/gateway/Draggable';
import { BgType } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { Panel, Spinner, Button, IconButton } from '@/components/ui';
import { PlusCircleIcon, CloudIcon, FileUploadIcon, SproutIcon } from '@/components/ui/icons';
import ConnectAccount from '@/components/auth/ConnectAccount';
import { SettingsKey } from '@/lib/constants';
import { getSetting } from '@/services/settings';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { importGarden } from '@/services/garden-io';
import * as syncApi from '@/api/sync';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { SetupStep } from '../components/gateway/SetupStep';

// ── Types ──────────────────────────────────────────────

enum Step {
  Banner = 'banner',
  Checking = 'checking',
  Choose = 'choose',
  Setup = 'setup',
  Cloud = 'cloud',
  Import = 'import',
}

// ── Main Component ─────────────────────────────────────

/**
 * Prepare the workspace's Mood before Enter. The entry surface has the shared
 * teaser design; it does not replace the person's saved Mood. A bundled
 * background remains ready until the Garden's own copy resolves after Enter.
 */
async function wearGatewayMood(): Promise<void> {
  const { bundledMood } = await import('@/lib/moods/bundled-moods');
  const worn = getSetting(SettingsKey.WornMoodId);
  const fresh = !worn && !getSetting(SettingsKey.MoodPresetDark);
  const keeper = bundledMood('plasma');
  if (fresh) {
    if (keeper) await applyMood(keeper, { sound: false });
  } else {
    const pkg = worn ? bundledMood(worn) : undefined;
    if (pkg?.bundled?.background && getSetting(SettingsKey.BackgroundType) === BgType.Image) {
      showBackgroundFallback(pkg.bundled.background);
    }
  }
  await startGatewaySound(fresh ? keeper : worn ? bundledMood(worn) : undefined);
}

/**
 * Set the mood: the Mood's track plays on the Gateway (Daniel, 2026-09-07 —
 * "the idea is we're setting the mood"). Before a garden exists the Blob Store
 * cannot answer, so a bundled Mood's track plays from its shipped URL; nothing
 * is persisted beyond what the player itself remembers (opt-in, playing). A
 * person who paused the sound last time is left in peace.
 */
async function startGatewaySound(pkg: MoodPackage | undefined): Promise<void> {
  const { useAudioStore } = await import('@/stores/audioStore');
  const sound = await import('@/services/sound');
  useAudioStore.getState().init();
  if (!isPublicSite() && !sound.getOptIn()) return;
  const st = useAudioStore.getState();
  const shipped = pkg?.bundled?.track;
  if (shipped) {
    const track = st.track
      ? { ...st.track, url: st.track.url ?? shipped.url }
      : { url: shipped.url, name: shipped.name, type: shipped.type };
    useAudioStore.setState({
      track,
      ...(st.track ? {} : { volume: pkg!.sound.volume, enabled: pkg!.sound.enabled }),
    });
  }
  const paused = sound.getOptIn() && !sound.getWasPlaying();
  if (!paused && useAudioStore.getState().enabled) {
    await useAudioStore
      .getState()
      .play()
      .catch((err: unknown) => {
        // A browser that wants a gesture first: the bar's play button is right there
        console.warn('Gateway sound did not start:', err);
      });
  }
}

/** The one rhythm (Daniel, 2026-09-07): background in over a second; the
 * title as soon as the curtain is up, in over 2 s with a quick start (the
 * entrance); on screen for fifteen, out over two — and any stir brings it straight
 * back, no animation. */
const CURTAIN_MS = 1_000;
const REVEAL_AFTER_MS = CURTAIN_MS;
const ENTRANCE_MS = 2_000;
const IDLE_AFTER_MS = 15_000;

export default function Gateway() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(Step.Banner);
  useEffect(() => {
    void wearGatewayMood().catch(() => {});
  }, []);

  // The curtain lifts first, then the banner arrives. After fifteen idle
  // seconds it rests; pointer or keyboard activity brings it back immediately.
  // Setup forms remain visible until the person finishes them.
  const [curtain, setCurtain] = useState<'down' | 'lifting' | 'gone'>('down');
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  visibleRef.current = visible;
  // The first appearance is the entrance (slow); once it has played, the stage
  // comes back instantly whenever the person stirs.
  const [entrance, setEntrance] = useState(true);
  useEffect(() => {
    if (!visible || !entrance) return;
    const t = setTimeout(() => setEntrance(false), ENTRANCE_MS + 100);
    return () => clearTimeout(t);
  }, [visible, entrance]);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A click while the stage is hidden only brings it back — it must never press
  // an invisible button (the pointer move that precedes a real click reveals first).
  const guardHiddenClick = (e: React.MouseEvent) => {
    if (visibleRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  };
  useEffect(() => {
    const lift = requestAnimationFrame(() => setCurtain('lifting'));
    const gone = setTimeout(() => setCurtain('gone'), CURTAIN_MS + 200);
    return () => {
      cancelAnimationFrame(lift);
      clearTimeout(gone);
    };
  }, []);
  useEffect(() => {
    const armIdle = () => {
      if (idle.current) clearTimeout(idle.current);
      // Only the banner step rests; a person mid-setup keeps their form
      if (step !== Step.Banner) return;
      idle.current = setTimeout(() => setVisible(false), IDLE_AFTER_MS);
    };
    const stir = () => {
      setVisible(true);
      armIdle();
    };
    const first = setTimeout(stir, REVEAL_AFTER_MS);
    window.addEventListener('pointermove', stir);
    window.addEventListener('pointerdown', stir);
    window.addEventListener('keydown', stir);
    return () => {
      clearTimeout(first);
      if (idle.current) clearTimeout(idle.current);
      window.removeEventListener('pointermove', stir);
      window.removeEventListener('pointerdown', stir);
      window.removeEventListener('keydown', stir);
    };
  }, [step]);

  return (
    <div className="teaser gateway">
      <TeaserMaterial>
        <PlasmaSurfaces />
        <div className="relative min-h-screen flex items-center justify-center p-6">
          {/* Desktop: Gateway renders outside the Shell (no TopBar), so provide a
          drag region or the frameless window can't be moved */}
          {can(Capability.DesktopChrome) && (
            <div
              className="fixed top-0 left-0 right-0 h-10 z-50"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />
          )}
          {curtain !== 'gone' && (
            <div
              aria-hidden
              data-testid="gateway-curtain"
              className={cn(
                'fixed inset-0 z-30 bg-bg pointer-events-none transition-opacity duration-[1000ms] ease-out',
                curtain === 'lifting' ? 'opacity-0' : 'opacity-100',
              )}
            />
          )}
          {/* The entry panel can be dragged; a new launch starts centred. */}
          <div
            data-testid="gateway-stage"
            data-visible={visible ? 'true' : 'false'}
            data-entrance={entrance ? 'true' : undefined}
            onClickCapture={guardHiddenClick}
            className="gateway-stage relative w-full max-w-[30rem] flex flex-col items-center"
          >
            <Draggable id="banner" label="Banner" className="w-full">
              <div className="w-full flex flex-col items-center gap-6">
                {(step === Step.Banner || step === Step.Checking) && (
                  <BannerStep
                    checking={step === Step.Checking}
                    onSetStep={setStep}
                    onNavigateHome={() => navigate('/home', { replace: true })}
                  />
                )}
                {step === Step.Choose && <ChooseStep onChoice={setStep} />}
                {step === Step.Setup && <SetupStep onBack={() => setStep(Step.Choose)} />}
                {step === Step.Cloud && <CloudStep onBack={() => setStep(Step.Choose)} />}
                {step === Step.Import && <ImportStep onBack={() => setStep(Step.Choose)} />}
              </div>
            </Draggable>
          </div>
        </div>
      </TeaserMaterial>
    </div>
  );
}

// ── Step: Banner ──────────────────────────────────────

function BannerStep({
  checking,
  onSetStep,
  onNavigateHome,
}: {
  checking?: boolean;
  onSetStep: (s: Step) => void;
  onNavigateHome: () => void;
}) {
  const onEnter = async () => {
    onSetStep(Step.Checking);
    try {
      await useAppStore.getState().bootstrap();

      if (getSetting(SettingsKey.LocalAuthorId)) {
        if (!useAppStore.getState().author) {
          await useAppStore.getState().ensureAuthor();
        }
        onNavigateHome();
      } else {
        onSetStep(Step.Choose);
      }
    } catch (err) {
      console.error('Gateway garden check failed:', err);
      onSetStep(Step.Choose);
    }
  };

  return (
    <TeaserPanel>
      <TeaserBrand />

      <div className="mt-6">
        <IconButton
          label="Enter"
          size="lg"
          onClick={onEnter}
          disabled={checking}
          className="!w-14 !h-14 rounded-full !text-accent hover:bg-accent/15 hover:!text-accent"
        >
          {checking ? <Spinner size={20} /> : <PlusCircleIcon size={40} />}
        </IconButton>
      </div>
    </TeaserPanel>
  );
}

// ── Step: Choose ──────────────────────────────────────

function ChooseStep({ onChoice }: { onChoice: (s: Step) => void }) {
  return (
    <Panel padding="lg" className="w-full motion-enter-dialog">
      <p className="text-sm text-text-muted text-center mb-6">
        Welcome. How would you like to get started?
      </p>

      <div className="flex flex-col gap-3">
        <OptionCard
          icon={<SproutIcon size={28} />}
          title="Plant a new garden"
          description="Begin fresh with an empty workspace"
          onClick={() => onChoice(Step.Setup)}
        />
        <OptionCard
          icon={<CloudIcon size={28} />}
          title="Log in and restore from crux.garden"
          description="Connect your account and restore your garden"
          onClick={() => onChoice(Step.Cloud)}
        />
        <OptionCard
          icon={<FileUploadIcon size={28} />}
          title="Restore from .garden file"
          description="Import a backup file and restore your garden"
          onClick={() => onChoice(Step.Import)}
        />
      </div>
    </Panel>
  );
}

function OptionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-4 px-4 py-4 rounded-[var(--radius-sm)]',
        'bg-surface border border-border text-left',
        'hover:border-accent hover:bg-accent-muted/30',
        'cursor-pointer group',
      )}
    >
      <div className="shrink-0 text-text-muted group-hover:text-accent">{icon}</div>
      <div>
        <div className="text-sm font-medium text-text group-hover:text-accent">{title}</div>
        <div className="text-xs text-text-muted mt-0.5">{description}</div>
      </div>
    </button>
  );
}

// ── Step: Setup ───────────────────────────────────────

function CloudStep({ onBack }: { onBack: () => void }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const email = useAuthStore((s) => s.account?.email);
  const [pulling, setPulling] = useState(false);
  const [noCloud, setNoCloud] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handlePull = async () => {
    setPulling(true);
    setError('');
    setStatus('Downloading garden...');
    try {
      const blob = await syncApi.pullGarden();
      setStatus('Importing...');
      await importGarden({ data: blob, onProgress: setStatus });
      await useAppStore.getState().ensureAuthor();

      setStatus('Redirecting...');
      setTimeout(() => {
        window.location.href = '/home';
      }, 400);
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) {
        setNoCloud(true);
        setError('');
      } else {
        setError('Pull failed. Check your connection and try again.');
      }
      setStatus('');
      setPulling(false);
    }
  };

  return (
    <Panel padding="lg" className="w-full motion-enter-dialog">
      <BackButton onClick={onBack} disabled={pulling} />

      <h2 className="font-display text-sm font-medium text-accent mb-4">Log in to your account</h2>

      {!isAuthenticated ? (
        <ConnectAccount description="Connect to restore your garden from crux.garden" />
      ) : noCloud ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Connected — <span className="font-mono text-text">{email}</span>
          </p>
          <p className="text-sm text-text-muted">
            No garden backup found at crux.garden. You may need to push from another device first
          </p>
          <Button variant="secondary" onClick={onBack} fullWidth>
            Back to options
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Connected — <span className="font-mono text-text">{email}</span>
          </p>
          <Button onClick={handlePull} loading={pulling} fullWidth>
            Restore garden
          </Button>
        </div>
      )}

      {status && <p className="text-xs font-mono text-text-muted mt-3">{status}</p>}
      {error && <p className="text-xs text-error mt-3">{error}</p>}
    </Panel>
  );
}

// ── Step 2b: Import from File ──────────────────────────

function ImportStep({ onBack }: { onBack: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setStatus('Importing garden...');
    try {
      await importGarden({ data: file, onProgress: setStatus });
      await useAppStore.getState().ensureAuthor();

      setStatus('Redirecting...');
      setTimeout(() => {
        window.location.href = '/home';
      }, 400);
    } catch (err) {
      console.error('Garden import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed — the file may be corrupted');
      setStatus('');
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.endsWith('.garden')) {
        setError('Please drop a .garden file');
        return;
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileRef.current) {
        fileRef.current.files = dt.files;
        fileRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, []);

  return (
    <Panel padding="lg" className="w-full motion-enter-dialog">
      <BackButton onClick={onBack} disabled={importing} />

      <h2 className="font-display text-sm font-medium text-accent mb-4">
        Restore from .garden file
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-[var(--radius)] p-8 text-center',
          dragOver ? 'border-accent bg-accent-muted/20' : 'border-border',
          importing && 'opacity-50 pointer-events-none',
        )}
      >
        <div className="text-text-muted mb-3">
          <FileUploadIcon />
        </div>
        <p className="text-sm text-text-muted mb-3">
          Drag & drop a <span className="font-mono text-text">.garden</span> file here
        </p>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={importing}>
          {importing ? 'Importing...' : 'Choose file'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".garden"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {status && <p className="text-xs font-mono text-text-muted mt-3">{status}</p>}
      {error && <p className="text-xs text-error mt-3">{error}</p>}
    </Panel>
  );
}

// ── Shared Components ──────────────────────────────────
