import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Spinner, Button, IconButton, ApiKeySetup } from '@/components/ui';
import { APP_NAME } from '@/lib/constants';
import { initServices, isServicesReady, ensureLocalAuthor, getBackend, getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import { useAuthStore } from '@/stores/authStore';
import { importGarden } from '@/services/garden-io';
import * as syncApi from '@/api/sync';
import { cn } from '@/lib/cn';

// ── Icons ──────────────────────────────────────────────

function PlusCircleIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M12 18v-6" />
      <path d="m9 15 3-3 3 3" />
    </svg>
  );
}

function SproutIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
      <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

// ── Types ──────────────────────────────────────────────

type Step = 'banner' | 'checking' | 'choose' | 'setup' | 'cloud' | 'import' | 'creating';

// ── Main Component ─────────────────────────────────────

export default function Landing() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('banner');

  const handleEnter = async () => {
    setStep('checking');
    try {
      if (!isServicesReady()) await initServices();

      const db = getSqliteClient();
      const row = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM cruxes WHERE type = 'workspace'",
      );
      if (row && row.count > 0) {
        // Existing garden — go straight home
        if (getBackend() === 'local' && !useAuthStore.getState().author) {
          const author = await ensureLocalAuthor();
          useAuthStore.setState({ author });
        }
        navigate('/home', { replace: true });
      } else {
        // No garden — show the wizard
        setStep('choose');
      }
    } catch {
      // If something goes wrong, still show the wizard
      setStep('choose');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        {/* Landing banner — only on entry */}
        {(step === 'banner' || step === 'checking') && (
          <div className="relative z-10 flex flex-col items-center bg-surface-solid border border-border rounded-[var(--radius)] px-12 py-10">
            <h1 className="font-display text-4xl font-medium text-text">{APP_NAME}</h1>
            <p className="text-text-muted text-lg mt-1">where ideas grow</p>

            <div className="mt-6">
              <IconButton
                label="Enter"
                size="lg"
                onClick={handleEnter}
                disabled={step === 'checking'}
                className="!w-14 !h-14 bg-surface !text-accent hover:bg-accent-muted"
              >
                {step === 'checking' ? <Spinner size={20} /> : <PlusCircleIcon />}
              </IconButton>
            </div>
          </div>
        )}

        {/* Wizard steps */}
        {step === 'choose' && <ChooseStep onChoice={setStep} />}
        {step === 'setup' && <SetupStep onBack={() => setStep('choose')} />}
        {step === 'cloud' && <CloudStep onBack={() => setStep('choose')} />}
        {step === 'import' && <ImportStep onBack={() => setStep('choose')} />}
        {step === 'creating' && <CreatingStep />}
      </div>
    </div>
  );
}

// ── Step 1: Choose ─────────────────────────────────────

function ChooseStep({ onChoice }: { onChoice: (s: Step) => void }) {
  return (
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-sm text-text-muted text-center mb-6">
        Welcome. How would you like to get started?
      </p>

      <div className="flex flex-col gap-3">
        <OptionCard
          icon={<SproutIcon />}
          title="Start a new garden"
          description="Begin fresh with an empty workspace"
          onClick={() => onChoice('setup')}
        />
        <OptionCard
          icon={<CloudIcon />}
          title="Sign in & pull from cloud"
          description="Connect your account and restore your garden"
          onClick={() => onChoice('cloud')}
        />
        <OptionCard
          icon={<FileIcon />}
          title="Import from file"
          description="Restore from a .garden backup file"
          onClick={() => onChoice('import')}
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
        'hover:border-accent hover:bg-accent-muted/30 transition-all duration-150',
        'cursor-pointer group',
      )}
    >
      <div className="shrink-0 text-text-muted group-hover:text-accent transition-colors">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-text group-hover:text-accent transition-colors">
          {title}
        </div>
        <div className="text-xs text-text-muted mt-0.5">{description}</div>
      </div>
    </button>
  );
}

// ── Step: Setup (username + API key) ───────────────────

function SetupStep({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { connectAccount, isAuthenticated } = useAuthStore();

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);

  // Cloud connection
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  const handleSendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setConnectionError('Please enter a valid email address');
      return;
    }
    setConnectionError('');
    setConnecting(true);
    try {
      await useAuthStore.getState().requestCode(email);
      setCodeSent(true);
    } catch {
      setConnectionError('Failed to send code');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnectionError('');
    setConnecting(true);
    try {
      await connectAccount(email, code);
      setEmail('');
      setCode('');
      setCodeSent(false);
    } catch {
      setConnectionError('Invalid code or connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      await useAuthStore.getState().disconnectAccount();
    } finally {
      setConnecting(false);
    }
  };

  const handleFinish = async () => {
    const trimmed = username.trim();
    if (trimmed && !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setUsernameError('Letters, numbers, hyphens, underscores only');
      return;
    }

    setSaving(true);
    try {
      if (!isServicesReady()) await initServices();

      // Create the local author
      const author = await ensureLocalAuthor();

      // Update username if provided
      if (trimmed) {
        const { author: authorService } = getServices();
        const updated = await authorService.update(author.id, { username: trimmed });
        useAuthStore.setState({ author: updated });
      } else {
        useAuthStore.setState({ author });
      }

      navigate('/home', { replace: true });
    } catch {
      setUsernameError('Something went wrong');
      setSaving(false);
    }
  };

  const inputClass = cn(
    'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-sm)]',
    'bg-surface-solid border text-text placeholder:text-text-muted',
    'focus:outline-none focus:border-accent',
    'disabled:opacity-50',
  );

  const busy = saving || connecting;

  return (
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <BackButton onClick={onBack} disabled={busy} />

      <h2 className="font-display text-sm font-medium text-accent mb-1">Set up your garden</h2>
      <p className="text-xs text-text-muted mb-5">You can always change these later in Settings.</p>

      {/* Username */}
      <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
        Username
      </label>
      <input
        type="text"
        value={username}
        onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
        onKeyDown={(e) => e.key === 'Enter' && handleFinish()}
        placeholder="wanderer"
        disabled={busy}
        className={cn(inputClass, usernameError ? 'border-error' : 'border-border')}
        autoFocus
      />
      {usernameError && <p className="text-xs text-error mt-1">{usernameError}</p>}

      {/* Cloud Connection */}
      <div className="border-t border-border my-5" />
      <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
        Connect to crux.garden
      </label>
      <p className="text-xs text-text-muted mb-3">
        Optional. Enables cloud sync and publishing.
      </p>

      {isAuthenticated ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            Connected as <span className="font-mono text-text">{useAuthStore.getState().account?.email}</span>
          </span>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="text-xs text-error hover:text-error/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setConnectionError(''); }}
            placeholder="email@example.com"
            disabled={busy || codeSent}
            className={cn(inputClass, 'border-border')}
            onKeyDown={(e) => e.key === 'Enter' && !codeSent && handleSendCode()}
          />
          {!codeSent ? (
            <Button variant="secondary" onClick={handleSendCode} loading={connecting} disabled={!email || busy} fullWidth>
              Send Code
            </Button>
          ) : (
            <>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setConnectionError(''); }}
                placeholder="Enter code from email"
                disabled={busy}
                className={cn(inputClass, 'border-border')}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleConnect} loading={connecting} disabled={!code || busy} fullWidth>
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setCodeSent(false); setCode(''); setConnectionError(''); }}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
          {connectionError && <p className="text-xs text-error">{connectionError}</p>}
        </div>
      )}

      {/* API Keys */}
      <div className="border-t border-border my-5" />
      <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
        AI Keys
      </label>
      <p className="text-xs text-text-muted mb-3">
        Add your own API key to start creating with AI. Keys stay in your browser.
      </p>
      <ApiKeySetup compact />

      {/* Continue */}
      <div className="mt-6">
        <Button onClick={handleFinish} loading={saving} disabled={connecting} fullWidth size="lg">
          Welcome
        </Button>
      </div>
    </Panel>
  );
}

// ── Step 2a: Cloud Sign-in + Pull ──────────────────────

function CloudStep({ onBack }: { onBack: () => void }) {
  const { connectAccount, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [noCloud, setNoCloud] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleSendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setConnecting(true);
    try {
      await useAuthStore.getState().requestCode(email);
      setCodeSent(true);
    } catch {
      setError('Failed to send code');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setError('');
    setConnecting(true);
    try {
      await connectAccount(email, code);
    } catch {
      setError('Invalid code or connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    setError('');
    setStatus('Downloading garden...');
    try {
      const blob = await syncApi.pullGarden();
      setStatus('Importing...');
      await importGarden({ data: blob, onProgress: setStatus });

      const author = await ensureLocalAuthor();
      useAuthStore.setState({ author });

      setStatus('Redirecting...');
      setTimeout(() => { window.location.href = '/home'; }, 400);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNoCloud(true);
        setError('');
      } else {
        setError('Pull failed. Check your connection and try again.');
      }
      setStatus('');
      setPulling(false);
    }
  };

  const inputClass = cn(
    'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-sm)]',
    'bg-surface-solid border border-border text-text placeholder:text-text-muted',
    'focus:outline-none focus:border-accent',
    'disabled:opacity-50',
  );

  return (
    <Panel padding="lg" className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <BackButton onClick={onBack} disabled={pulling} />

      <h2 className="font-display text-sm font-medium text-accent mb-4">Sign in to your account</h2>

      {!isAuthenticated ? (
        <div className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="email@example.com"
            disabled={connecting || codeSent}
            className={inputClass}
            onKeyDown={(e) => e.key === 'Enter' && !codeSent && handleSendCode()}
          />

          {!codeSent ? (
            <Button onClick={handleSendCode} loading={connecting} disabled={!email} fullWidth>
              Send Code
            </Button>
          ) : (
            <>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                placeholder="Enter code from email"
                disabled={connecting}
                className={inputClass}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <div className="flex gap-2">
                <Button onClick={handleConnect} loading={connecting} disabled={!code} fullWidth>
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setCodeSent(false); setCode(''); setError(''); }}
                  disabled={connecting}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
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

      const author = await ensureLocalAuthor();
      useAuthStore.setState({ author });

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
          'border-2 border-dashed rounded-[var(--radius)] p-8 text-center transition-colors',
          dragOver ? 'border-accent bg-accent-muted/20' : 'border-border',
          importing && 'opacity-50 pointer-events-none',
        )}
      >
        <div className="text-text-muted mb-3">
          <FileIcon />
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
        'flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors mb-4 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      <ArrowLeftIcon />
      Back
    </button>
  );
}
