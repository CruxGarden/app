import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Spinner, Button, IconButton, ApiKeySetup, Toggle } from '@/components/ui';
import { PlusCircleIcon, CloudIcon, FileUploadIcon, SproutIcon, ArrowLeftIcon } from '@/components/ui/icons';
import ConnectAccount from '@/components/auth/ConnectAccount';
import AvatarUpload from '@/components/auth/AvatarUpload';
import { APP_NAME } from '@/lib/constants';
import { initServices, isServicesReady } from '@/services';
import { PROVIDERS } from '@/ai/providers';
import { getApiKey } from '@/ai/keys';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { importGarden } from '@/services/garden-io';
import * as syncApi from '@/api/sync';
import { cn } from '@/lib/cn';

// ── Types ──────────────────────────────────────────────

enum Step {
  Banner = 'banner',
  Checking = 'checking',
  Choose = 'choose',
  Setup = 'setup',
  Cloud = 'cloud',
  Import = 'import',
  Creating = 'creating',
}

// ── Main Component ─────────────────────────────────────

export default function Gateway() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(Step.Banner);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
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
        {step === Step.Creating && <CreatingStep />}
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
          className="!w-14 !h-14 bg-surface !text-accent hover:bg-accent-muted"
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
          title="Start a new garden"
          description="Begin fresh with an empty workspace"
          onClick={() => onChoice(Step.Setup)}
        />
        <OptionCard
          icon={<CloudIcon size={28} />}
          title="Sign in & pull from cloud"
          description="Connect your account and restore your garden"
          onClick={() => onChoice(Step.Cloud)}
        />
        <OptionCard
          icon={<FileUploadIcon size={28} />}
          title="Import from file"
          description="Restore from a .garden backup file"
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

  const handleAiToggle = (enabled: boolean) => {
    setAiEnabled(enabled);
    setSetting(SettingsKey.AiEnabled, enabled ? 'true' : 'false');
  };

  const checkApiKeys = async () => {
    for (const id of Object.keys(PROVIDERS)) {
      if (await getApiKey(id)) { setKeysConfigured(true); return; }
    }
    setKeysConfigured(false);
  };

  const toggle = (section: SetupSection) =>
    setOpenSection((prev) => (prev === section ? null : section));

  // Validate username against the API when connected
  const validateUsername = async (name: string): Promise<boolean> => {
    if (!name || !isAuthenticated) return true;
    try {
      const { authors } = await import('@/api');
      const { available } = await authors.checkUsername(name.toLowerCase());
      if (!available) {
        setUsernameError('Username is taken');
        setOpenSection(SetupSection.Username);
        return false;
      }
    } catch { /* API unavailable — skip check */ }
    return true;
  };

  const handleFinish = async () => {
    const trimmed = username.trim();
    if (trimmed && trimmed.length < 3) {
      setUsernameError('At least 3 characters');
      setOpenSection(SetupSection.Username);
      return;
    }
    if (trimmed && !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setUsernameError('Letters, numbers, hyphens, underscores only');
      setOpenSection(SetupSection.Username);
      return;
    }

    setSaving(true);
    try {
      // Validate against API if connected
      if (!(await validateUsername(trimmed))) {
        setSaving(false);
        return;
      }

      if (!isServicesReady()) await initServices();
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
          summary={username || 'Required'}
          completed={!!username}
          required={!username}
        />
        {openSection === SetupSection.Username && (
          <div className="pt-3 pb-4 px-1">
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleFinish()}
              onBlur={() => { if (username.trim()) validateUsername(username.trim()); }}
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

        {/* Avatar */}
        <AccordionHeader
          label="Upload Avatar"
          open={openSection === SetupSection.Avatar}
          onToggle={() => toggle(SetupSection.Avatar)}
          summary={author?.meta?.avatarUrl ? 'Uploaded' : 'Optional'}
          completed={!!author?.meta?.avatarUrl}
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
                  Add your own API key to start creating with AI. Keys stay in your browser
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
              onConnected={async () => {
                const apiAuthor = useAppStore.getState().author;
                if (!apiAuthor) return;

                // If the API account already has a real username, adopt it
                if (apiAuthor.username && !apiAuthor.username.startsWith('wanderer-')) {
                  setUsername(apiAuthor.username);
                  setUsernameError('');
                  return;
                }

                // New account — validate the locally chosen username
                if (username.trim()) {
                  await validateUsername(username.trim());
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Continue */}
      <div className="mt-6">
        <Button onClick={handleFinish} loading={saving} disabled={!username.trim() || !!usernameError} fullWidth size="md">
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

      <h2 className="font-display text-sm font-medium text-accent mb-4">Sign in to your account</h2>

      {!isAuthenticated ? (
        <ConnectAccount description="Connect to pull your garden from the cloud." />
      ) : noCloud ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Connected as <span className="font-mono text-text">{useAuthStore.getState().account?.email}</span>
          </p>
          <p className="text-sm text-text-muted">
            No garden found in the cloud. You may need to push from another device first.
          </p>
          <Button variant="secondary" onClick={onBack} fullWidth>
            Back to options
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Connected as <span className="font-mono text-text">{useAuthStore.getState().account?.email}</span>
          </p>
          <Button onClick={handlePull} loading={pulling} fullWidth>
            Pull garden from cloud
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
      if (!isServicesReady()) await initServices();
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

      <h2 className="font-display text-sm font-medium text-accent mb-4">Import from file</h2>

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

// ── Step: Creating (brief transition) ──────────────────

function CreatingStep() {
  return (
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-center gap-3 py-4">
        <Spinner size={16} />
        <span className="text-sm text-text-muted">Preparing your garden...</span>
      </div>
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
