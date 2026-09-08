import { useState, useRef, useCallback, useEffect } from 'react';
import { applyMood, type MoodPackage } from '@/lib/moods/packages';
import MoodBar from '@/components/mood/MoodBar';
import Draggable from '@/components/gateway/Draggable';
import { BgType } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { Panel, Spinner, Button, IconButton, ApiKeySetup, Toggle } from '@/components/ui';
import {
  PlusCircleIcon,
  CloudIcon,
  FileUploadIcon,
  SproutIcon,
  ArrowLeftIcon,
} from '@/components/ui/icons';
import ConnectAccount from '@/components/auth/ConnectAccount';
import AvatarUpload from '@/components/auth/AvatarUpload';
import { APP_NAME, SettingsKey } from '@/lib/constants';
import { PROVIDERS } from '@/ai/providers';
import { getApiKey } from '@/ai/keys';
import { getSetting, setSetting } from '@/services/settings';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import { importGarden } from '@/services/garden-io';
import * as syncApi from '@/api/sync';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { getGardenRoot, chooseGardenRoot, shortenHomePath } from '@/services/desktop';

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
 * The Gateway wears a Mood too. First run: The Keeper's look (theme and the
 * vista from its shipped URL — no garden yet, so no sound and nothing to
 * ingest). Returning: the theme is already painted from the synced settings;
 * a bundled Mood's background image is shown from its URL until the garden's
 * own copy resolves after Enter.
 */
async function wearGatewayMood(): Promise<void> {
  const { bundledMood } = await import('@/lib/moods/bundled-moods');
  const worn = getSetting(SettingsKey.WornMoodId);
  const fresh = !worn && !getSetting(SettingsKey.MoodPresetDark);
  const keeper = bundledMood('the-keeper');
  if (fresh) {
    if (keeper) await applyMood(keeper, { sound: false });
  } else {
    const pkg = worn ? bundledMood(worn) : undefined;
    if (pkg?.bundled?.background && getSetting(SettingsKey.BackgroundType) === BgType.Image) {
      const { useMoodStore } = await import('@/stores/moodStore');
      if (!useMoodStore.getState().backgroundUrl)
        useMoodStore.setState({ backgroundUrl: pkg.bundled.background });
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
 * title five seconds after launch, in over 2 s with a quick start (the
 * entrance); on screen for fifteen, out over two — and any stir brings it straight
 * back, no animation. */
const CURTAIN_MS = 1_000;
const REVEAL_AFTER_MS = 5_000;
const ENTRANCE_MS = 2_000;
const IDLE_AFTER_MS = 15_000;

export default function Gateway() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(Step.Banner);
  useEffect(() => {
    void wearGatewayMood().catch(() => {});
  }, []);

  // Arrival: the music starts and the background fades in; the banner and the
  // player wait until the person stirs — mouse, click, key — or half a minute
  // — or ten seconds pass — then rise out of the image (a fade with a lift
  // and a clearing blur). On the banner step they sink away again after ten
  // seconds without movement, to let the room be looked at; any stir brings
  // them back (Daniel, 2026-09-07). A curtain in the page colour lifts first.
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
    <div className="relative min-h-screen flex items-center justify-center p-4">
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
      {/* The banner with the Mood's player directly below it, centred. Both can be
          dragged anywhere; the place is remembered. Hidden until the person stirs. */}
      <div
        data-testid="gateway-stage"
        data-visible={visible ? 'true' : 'false'}
        data-entrance={entrance ? 'true' : undefined}
        onClickCapture={guardHiddenClick}
        className="gateway-stage relative w-full max-w-md flex flex-col items-center"
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
        {/* The banner keeps the exact centre of the window; the player hangs below it */}
        <div className="absolute inset-x-0 top-full mt-5 flex justify-center">
          <Draggable id="player" label="Player" handle riseDelayMs={55} anchorId="banner">
            <MoodBar gateway />
          </Draggable>
        </div>
      </div>
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
    <Panel padding="lg" className="w-fit flex flex-col items-center px-8 py-6">
      <h1 className="font-wordmark text-5xl font-semibold text-gateway-title">{APP_NAME}</h1>
      <p className="text-gateway-subtitle text-lg mt-1">where ideas grow</p>

      <div className="mt-6">
        <IconButton
          label="Enter"
          size="lg"
          onClick={onEnter}
          disabled={checking}
          className="!w-14 !h-14 bg-gateway-button !text-gateway-button-text hover:bg-gateway-button-hover hover:!text-gateway-button-text"
        >
          {checking ? <Spinner size={20} /> : <PlusCircleIcon size={40} />}
        </IconButton>
      </div>
    </Panel>
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

enum SetupSection {
  Username = 'username',
  Avatar = 'avatar',
  Connect = 'connect',
  Keys = 'keys',
  GardenRoot = 'gardenRoot',
}

function SetupStep({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const author = useAppStore((s) => s.author);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState<SetupSection | null>(SetupSection.Username);
  const [aiEnabled, setAiEnabled] = useState(() => getSetting(SettingsKey.AiEnabled) === 'true');
  const [keysConfigured, setKeysConfigured] = useState(false);
  const desktop = can(Capability.ProjectFolder);
  const [gardenRoot, setGardenRoot] = useState<string | null>(null);

  // Desktop: show where Project Folders will live
  useEffect(() => {
    if (desktop) getGardenRoot().then(setGardenRoot);
  }, [desktop]);

  const handleChooseGardenRoot = async () => {
    const chosen = await chooseGardenRoot();
    if (chosen) setGardenRoot(chosen);
  };

  const handleAiToggle = (enabled: boolean) => {
    setAiEnabled(enabled);
    setSetting(SettingsKey.AiEnabled, enabled ? 'true' : 'false');
    useUIStore.getState().setAiEnabled(enabled);
  };

  const checkApiKeys = async () => {
    for (const id of Object.keys(PROVIDERS)) {
      if (await getApiKey(id)) {
        setKeysConfigured(true);
        return;
      }
    }
    setKeysConfigured(false);
  };

  const toggle = (section: SetupSection) =>
    setOpenSection((prev) => (prev === section ? null : section));

  // Inline format validation (runs on every keystroke)
  const validateFormat = (name: string): string => {
    if (!name) return '';
    if (name.length < 3) return 'At least 3 characters';
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Letters, numbers, hyphens, underscores only';
    return '';
  };

  // Debounced API availability check
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const checkAvailability = (name: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!name || name.length < 3 || !isAuthenticated) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const { authors } = await import('@/api');
        const { available } = await authors.checkUsername(name.toLowerCase());
        // Only set error if the username hasn't changed since the check started
        if (useAppStore.getState().author?.username !== name) {
          setUsernameError((prev) => prev || (available ? '' : 'Username is taken at crux.garden'));
        }
        if (!available) setUsernameError('Username is taken at crux.garden');
      } catch {
        /* API unavailable — skip check */
      }
    }, 400);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    const formatError = validateFormat(value.trim());
    setUsernameError(formatError);
    if (!formatError) checkAvailability(value.trim());
  };

  // Cleanup debounce timer
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Validate username against the API when connected (used by handleFinish)
  const validateUsername = async (name: string): Promise<boolean> => {
    const formatError = validateFormat(name);
    if (formatError) {
      setUsernameError(formatError);
      setOpenSection(SetupSection.Username);
      return false;
    }
    if (!isAuthenticated) return true;
    try {
      const { authors } = await import('@/api');
      const { available } = await authors.checkUsername(name.toLowerCase());
      if (!available) {
        setUsernameError('Username is taken at crux.garden');
        setOpenSection(SetupSection.Username);
        return false;
      }
    } catch {
      /* API unavailable — skip check */
    }
    return true;
  };

  const handleFinish = async () => {
    const trimmed = username.trim();

    setSaving(true);
    try {
      // Final validation (format + API availability)
      if (!(await validateUsername(trimmed))) {
        setSaving(false);
        return;
      }

      await useAppStore.getState().ensureAuthor();

      if (trimmed) {
        await useAppStore.getState().updateAuthor({ username: trimmed });
      }

      // A new garden wears the Default Mood — The Keeper: the vista, Moss, the
      // Keeper's face and track. Restored gardens bring their own and skip this.
      try {
        const { bundledMood } = await import('@/lib/moods/bundled-moods');
        const keeper = bundledMood('the-keeper');
        if (keeper) await applyMood(keeper);
      } catch {
        /* the garden still opens; the Mood can be applied from the Mood modal */
      }

      navigate('/home', { replace: true });
    } catch {
      setUsernameError('Something went wrong');
      setSaving(false);
    }
  };

  return (
    <Panel padding="lg" className="w-full motion-enter-dialog">
      <BackButton onClick={onBack} disabled={saving} />

      <h2 className="font-display text-sm font-medium text-accent mb-1">Set up your garden</h2>
      <p className="text-xs text-text-muted mb-6">You can always change these later in Settings</p>

      <div className="flex flex-col gap-2">
        {/* Username */}
        <AccordionHeader
          label="Pick Username"
          open={openSection === SetupSection.Username}
          onToggle={() => toggle(SetupSection.Username)}
          summary={username || 'Optional'}
          completed={!!username && !usernameError}
          required={!!usernameError}
        />
        {openSection === SetupSection.Username && (
          <div className="pt-3 pb-4 px-1">
            <p className="text-xs text-text-muted mb-2">
              Optional — you can pick one when you publish or connect
            </p>
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFinish()}
              placeholder="wanderer"
              disabled={saving}
              className={cn(
                'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-sm)]',
                'bg-surface-solid border text-text placeholder:text-text-muted',
                'focus:outline-none focus:border-input-border-active',
                usernameError ? 'border-error' : 'border-border',
              )}
              autoFocus
            />
            {usernameError && <p className="text-xs text-error mt-1">{usernameError}</p>}
          </div>
        )}

        {/* Garden Location (desktop only) */}
        {desktop && (
          <>
            <AccordionHeader
              label="Garden Location"
              open={openSection === SetupSection.GardenRoot}
              onToggle={() => toggle(SetupSection.GardenRoot)}
              summary={gardenRoot ? shortenHomePath(gardenRoot) : '…'}
              completed={!!gardenRoot}
            />
            {openSection === SetupSection.GardenRoot && (
              <div className="pt-3 pb-4 px-1">
                <p className="text-xs text-text-muted mb-3">
                  Every crux you create becomes a real folder here — open them in Finder, your
                  editor, or any tool. You can move this later in Settings.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text truncate">
                    {gardenRoot ? shortenHomePath(gardenRoot) : 'Loading…'}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleChooseGardenRoot}
                    disabled={saving}
                  >
                    Choose…
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Avatar */}
        <AccordionHeader
          label="Upload Avatar"
          open={openSection === SetupSection.Avatar}
          onToggle={() => toggle(SetupSection.Avatar)}
          summary={author?.meta?.avatarFingerprint ? 'Uploaded' : 'Optional'}
          completed={!!author?.meta?.avatarFingerprint}
        />
        {openSection === SetupSection.Avatar && (
          <div className="pt-3 pb-4 px-1">
            <AvatarUpload compact />
          </div>
        )}

        {/* AI Tools */}
        <AccordionHeader
          label="Configure AI Tools"
          open={openSection === SetupSection.Keys}
          onToggle={() => toggle(SetupSection.Keys)}
          summary={!aiEnabled ? 'Disabled' : keysConfigured ? 'Configured' : 'Optional'}
          completed={aiEnabled && keysConfigured}
        />
        {openSection === SetupSection.Keys && (
          <div className="pt-3 pb-4 px-1">
            <div className="flex items-center justify-between">
              <Toggle checked={aiEnabled} onChange={handleAiToggle} label="Enable AI Tools" />
            </div>
            {aiEnabled && (
              <div className="mt-3">
                <p className="text-xs text-text-muted mb-3">
                  {can(Capability.SecureSecrets)
                    ? 'Add one or more API keys to build with AI agents. Keys are encrypted in your Mac’s Keychain'
                    : 'Add one or more API keys to build with AI agents. Keys stay in your browser'}
                </p>
                <ApiKeySetup compact autoFocus onKeyChange={checkApiKeys} />
              </div>
            )}
          </div>
        )}

        {/* Connect */}
        <AccordionHeader
          label="Connect to crux.garden"
          open={openSection === SetupSection.Connect}
          onToggle={() => toggle(SetupSection.Connect)}
          summary={isAuthenticated ? 'Connected' : 'Optional'}
          completed={isAuthenticated}
        />
        {openSection === SetupSection.Connect && (
          <div className="pt-3 pb-4 px-1">
            <ConnectAccount
              compact
              autoFocus
              description="Enables storage, sync, and share features"
              onDisconnected={() => {
                // Clear API-specific errors — username is only local now
                if (usernameError.includes('crux.garden')) setUsernameError('');
              }}
              onConnected={async () => {
                const apiAuthor = useAppStore.getState().author;
                if (!apiAuthor) return;

                // If the API account already has a real username, adopt it
                if (apiAuthor.username && !apiAuthor.username.startsWith('wanderer-')) {
                  setUsername(apiAuthor.username);
                  setUsernameError('');
                  return;
                }

                // New account — validate the locally chosen username against the API
                // Read isAuthenticated directly from store since the closure value may be stale
                const trimmed = username.trim();
                if (trimmed && useAuthStore.getState().isAuthenticated) {
                  try {
                    const { authors } = await import('@/api');
                    const { available } = await authors.checkUsername(trimmed.toLowerCase());
                    if (!available) {
                      setUsernameError('Username is taken at crux.garden');
                      setOpenSection(SetupSection.Username);
                    }
                  } catch {
                    /* API unavailable */
                  }
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Continue */}
      <div className="mt-6">
        <Button
          onClick={handleFinish}
          loading={saving}
          disabled={!!usernameError}
          fullWidth
          size="md"
        >
          Welcome
        </Button>
      </div>
    </Panel>
  );
}

function AccordionHeader({
  label,
  open,
  onToggle,
  summary,
  completed,
  required,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  summary?: string;
  completed?: boolean;
  required?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)]',
        'text-left cursor-pointer',
        open
          ? 'bg-surface border border-accent/20 text-accent'
          : 'text-text-muted hover:text-text hover:bg-surface/50',
      )}
    >
      <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2">
        {!open && summary && (
          <span
            className={cn(
              'text-2xs font-mono',
              required ? 'text-error' : completed ? 'text-accent' : 'text-text-muted',
            )}
          >
            {summary}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(open && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </button>
  );
}

// ── Step 2a: Cloud Sign-in + Pull ──────────────────────

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

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 text-xs text-text-muted hover:text-text mb-4 cursor-pointer',
        'disabled:cursor-not-allowed',
      )}
    >
      <ArrowLeftIcon />
      Back
    </button>
  );
}
