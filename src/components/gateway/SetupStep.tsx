import { useState, useRef, useEffect } from 'react';
import BackButton from './BackButton';
import { applyMood } from '@/lib/moods/packages';
import { useNavigate } from 'react-router-dom';
import { Panel, Button, ApiKeySetup, Toggle } from '@/components/ui';
import ConnectAccount from '@/components/auth/ConnectAccount';
import AvatarUpload from '@/components/auth/AvatarUpload';
import { SettingsKey } from '@/lib/constants';
import { PROVIDERS } from '@/ai/providers';
import { getApiKey } from '@/ai/keys';
import { getSetting, setSetting } from '@/services/settings';
import { seedWelcomeCrux } from '@/services/welcome-crux';
import { captureGardenId } from '@/stores/gardenContext';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { getGardenRoot, chooseGardenRoot, shortenHomePath } from '@/services/desktop';

enum SetupSection {
  Username = 'username',
  Avatar = 'avatar',
  Connect = 'connect',
  Keys = 'keys',
  GardenRoot = 'gardenRoot',
}

/** The Gateway's set-up step: username, avatar, account, keys and the Garden root, as an accordion. */
export function SetupStep({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const author = useAppStore((s) => s.author);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [includeWelcome, setIncludeWelcome] = useState(() => can(Capability.Build));
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
      try {
        if (await getApiKey(id)) {
          setKeysConfigured(true);
          return;
        }
      } catch {
        // ApiKeySetup displays the provider's storage failure and retry advice.
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

  // Debounced API availability check. The answer is about the name that was
  // sent, so it is only worth showing while that is still the name in the
  // field — otherwise a slow reply about "dan" marks "daniel" as taken.
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const typedRef = useRef('');
  const checkAvailability = (name: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!name || name.length < 3 || !isAuthenticated) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const { authors } = await import('@/api');
        const { available } = await authors.checkUsername(name.toLowerCase());
        if (typedRef.current !== name) return;
        setUsernameError(available ? '' : 'Username is taken at crux.garden');
      } catch {
        /* API unavailable — skip check */
      }
    }, 400);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    const formatError = validateFormat(value.trim());
    typedRef.current = value.trim();
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

      // A new garden wears the Default Mood — Fractal Garden (ADR 0043):
      // the plasma material, its aurora field and Vel's voice.
      // Restored gardens bring their own and skip this.
      try {
        const { bundledMood } = await import('@/lib/moods/bundled-moods');
        const keeper = bundledMood('plasma');
        if (keeper) await applyMood(keeper);
      } catch {
        /* the garden still opens; the Mood can be applied from the Mood pane */
      }

      if (includeWelcome && can(Capability.Build)) {
        const id = await seedWelcomeCrux(captureGardenId());
        useUIStore.getState().seedCruxLayout(id, 22);
      }
      navigate('/home', { replace: true });
    } catch (error) {
      setUsernameError(
        error instanceof Error ? error.message : 'Your Garden could not be set up. Try again.',
      );
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

      {can(Capability.Build) && (
        <label className="flex items-start gap-2 mt-5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={includeWelcome}
            disabled={saving}
            onChange={(event) => setIncludeWelcome(event.target.checked)}
          />
          <span>
            Include a first home page walkthrough{' '}
            <span className="block">Add your name and photo, then share. No AI required.</span>
          </span>
        </label>
      )}

      {/* Continue */}
      <div className="mt-6">
        <Button
          onClick={handleFinish}
          loading={saving}
          disabled={!!validateFormat(username.trim())}
          fullWidth
          size="md"
        >
          Welcome
        </Button>
      </div>
    </Panel>
  );
}

export function AccordionHeader({
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
        'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)]',
        'text-left cursor-pointer',
        open
          ? 'bg-surface border border-accent/20 text-accent'
          : 'text-text-muted hover:text-text hover:bg-surface/50',
      )}
    >
      <span className="text-xs font-mono uppercase tracking-wider shrink-0 whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        {!open && summary && (
          <span
            title={summary}
            className={cn(
              'text-2xs font-mono truncate',
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
