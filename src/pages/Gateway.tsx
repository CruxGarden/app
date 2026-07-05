import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Spinner, Button, IconButton, ApiKeySetup, Toggle } from '@/components/ui';
import { PlusCircleIcon, CloudIcon, FileUploadIcon, SproutIcon, ArrowLeftIcon } from '@/components/ui/icons';
import ConnectAccount from '@/components/auth/ConnectAccount';
import AvatarUpload from '@/components/auth/AvatarUpload';
import { APP_NAME, SettingsKey } from '@/lib/constants';
import { initServices, isServicesReady } from '@/services';
import { PROVIDERS } from '@/ai/providers';
import { getApiKey } from '@/ai/keys';
import { getSetting, setSetting } from '@/services/settings';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import { importGarden } from '@/services/garden-io';
import * as syncApi from '@/api/sync';
import { cn } from '@/lib/cn';
import { isDesktop } from '@/lib/platform';
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

export default function Gateway() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(Step.Banner);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      {/* Desktop: Gateway renders outside the Shell (no TopBar), so provide a
          drag region or the frameless window can't be moved */}
      {isDesktop() && (
        <div
          className="fixed top-0 left-0 right-0 h-10 z-50"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}
      <div className="w-full max-w-md flex flex-col items-center gap-6">
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
      if (!isServicesReady()) await initServices();

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
    <Panel padding="lg" className="max-w-xs w-full flex flex-col items-center py-10">
      <h1 className="font-display text-4xl font-medium text-gateway-title">{APP_NAME}</h1>
      <p className="text-gateway-subtitle text-lg mt-1">where ideas grow</p>

      <div className="mt-6">
        <IconButton
          label="Enter"
          size="lg"
          onClick={onEnter}
          disabled={checking}
          className="!w-14 !h-14 bg-panel !text-accent hover:bg-accent/20 hover:!text-accent"
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
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
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
      <div className="shrink-0 text-text-muted group-hover:text-accent">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-text group-hover:text-accent">
          {title}
        </div>
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
  const desktop = isDesktop();
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
      if (await getApiKey(id)) { setKeysConfigured(true); return; }
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
      } catch { /* API unavailable — skip check */ }
    }, 400);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    const formatError = validateFormat(value.trim());
    setUsernameError(formatError);
    if (!formatError) checkAvailability(value.trim());
  };

  // Cleanup debounce timer
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Validate username against the API when connected (used by handleFinish)
  const validateUsername = async (name: string): Promise<boolean> => {
    const formatError = validateFormat(name);
    if (formatError) { setUsernameError(formatError); setOpenSection(SetupSection.Username); return false; }
    if (!isAuthenticated) return true;
    try {
      const { authors } = await import('@/api');
      const { available } = await authors.checkUsername(name.toLowerCase());
      if (!available) {
        setUsernameError('Username is taken at crux.garden');
        setOpenSection(SetupSection.Username);
        return false;
      }
    } catch { /* API unavailable — skip check */ }
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

      navigate('/home', { replace: true });
    } catch {
      setUsernameError('Something went wrong');
      setSaving(false);
    }
  };

  return (
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                'focus:outline-none focus:border-accent disabled:opacity-50',
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
                  Every crux you create becomes a real folder here — open them in Finder,
                  your editor, or any tool. You can move this later in Settings.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text truncate">
                    {gardenRoot ? shortenHomePath(gardenRoot) : 'Loading…'}
                  </code>
                  <Button variant="secondary" size="sm" onClick={handleChooseGardenRoot} disabled={saving}>
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
                  {isDesktop()
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
                  } catch { /* API unavailable */ }
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Continue */}
      <div className="mt-6">
        <Button onClick={handleFinish} loading={saving} disabled={!!usernameError} fullWidth size="md">
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
          <span className={cn('text-[10px] font-mono', required ? 'text-error' : completed ? 'text-accent' : 'text-text-muted')}>{summary}</span>
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
      setTimeout(() => { window.location.href = '/home'; }, 400);
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
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
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
      setTimeout(() => { window.location.href = '/home'; }, 400);
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
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <BackButton onClick={onBack} disabled={importing} />

      <h2 className="font-display text-sm font-medium text-accent mb-4">Restore from .garden file</h2>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          loading={importing}
        >
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
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      <ArrowLeftIcon />
      Back
    </button>
  );
}
