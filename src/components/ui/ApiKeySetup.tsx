import { useState, useEffect, useRef, useMemo } from 'react';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import { cn } from '@/lib/cn';
import { getApiKey, setApiKey, removeApiKey } from '@/ai/keys';
import { isLocalModel } from '@/ai/local';
import { PROVIDERS, isAgentModel } from '@/ai/providers';
import { checkApiKey, keyCheckMessage, type KeyCheckResult } from '@/ai/key-check';
import { isAiMock } from '@/lib/platform';
import { agentStatus } from '@/services/agent-provider';
import { Capability, can } from '@/lib/platform';
import type { AgentStatus } from '../../../electron/src/bridge';
import { PROVIDER_ICONS } from './ProviderIcons';

const PROVIDER_PLACEHOLDERS: Record<string, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  google: 'AIza...',
};

interface ApiKeySetupProps {
  compact?: boolean;
  onKeySaved?: () => void;
  onKeyChange?: () => void;
  autoFocus?: boolean;
  /** Only these providers (by id), in this order; every provider when omitted. */
  providers?: string[];
}

export default function ApiKeySetup({
  compact,
  onKeySaved,
  onKeyChange,
  autoFocus,
  providers,
}: ApiKeySetupProps) {
  const advancedMode = useAdvancedMode();
  const providerKey = (providers ?? Object.keys(PROVIDERS)).join(',');
  // Claude Code (ADR 0019) is a provider without a key; desktop only.
  const providerIds = useMemo(
    () =>
      providerKey
        .split(',')
        .filter(
          (id) =>
            !!PROVIDERS[id] &&
            id !== 'included' &&
            (!isAgentModel(id) || can(Capability.AgentHost)) &&
            (advancedMode || (!isAgentModel(id) && !isLocalModel(PROVIDERS[id]!.defaultModel))),
        ),
    [providerKey, advancedMode],
  );
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});
  useEffect(() => {
    let cancelled = false;
    if (can(Capability.AgentHost))
      for (const provider of Object.values(PROVIDERS).filter(
        (provider) => provider.agent && providerIds.includes(provider.id),
      )) {
        void agentStatus(true, provider.id).then((status) => {
          if (!cancelled) setAgents((current) => ({ ...current, [provider.id]: status }));
        });
      }
    return () => {
      cancelled = true;
    };
  }, [providerIds]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const pending = useRef(new Set<string>());
  // The check after a save (EF07): it reports beside the key and never holds
  // the save back. A newer save or a removal makes an older answer stale.
  const [checks, setChecks] = useState<Record<string, 'checking' | KeyCheckResult>>({});
  const checkRun = useRef<Record<string, number>>({});
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const verifyKey = (providerId: string, value: string | null) => {
    const run = (checkRun.current[providerId] ?? 0) + 1;
    checkRun.current[providerId] = run;
    const show = (state: 'checking' | KeyCheckResult | null) => {
      if (!mounted.current || checkRun.current[providerId] !== run) return;
      setChecks((current) => {
        const next = { ...current };
        if (state === null) delete next[providerId];
        else next[providerId] = state;
        return next;
      });
    };
    // The scripted model of the test suite has no provider to ask.
    if (value === null || !PROVIDERS[providerId]?.keyCheck || isAiMock()) return show(null);
    show('checking');
    void checkApiKey(providerId, value).then(show);
  };

  // Load each provider independently: one locked key must not hide the others.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const newHints: Record<string, string> = {};
      const newErrors: Record<string, string> = {};
      for (const id of providerIds) {
        if (isLocalModel(PROVIDERS[id]!.defaultModel) || isAgentModel(id)) continue; // no key
        try {
          const key = await getApiKey(id);
          if (key) newHints[id] = `${key.slice(0, 7)}...${key.slice(-4)}`;
        } catch {
          newErrors[id] =
            'Could not read saved key. Unlock your system keychain and reopen Settings. If the credential file is damaged, restore it from your device backup.';
        }
      }
      if (!cancelled) {
        setHints(newHints);
        setErrors(newErrors);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerIds]);

  const changeKey = async (providerId: string, value: string | null) => {
    if (loading || pending.current.has(providerId)) return;
    pending.current.add(providerId);
    setBusy((current) => ({ ...current, [providerId]: true }));
    try {
      if (value === null) await removeApiKey(providerId);
      else await setApiKey(providerId, value);
      setHints((current) => {
        const next = { ...current };
        if (value === null) delete next[providerId];
        else next[providerId] = `${value.slice(0, 7)}...${value.slice(-4)}`;
        return next;
      });
      setInputs((current) => ({ ...current, [providerId]: '' }));
      setErrors((current) => ({ ...current, [providerId]: '' }));
      verifyKey(providerId, value);
    } catch {
      setErrors((current) => ({
        ...current,
        [providerId]:
          value === null
            ? 'Could not remove key. Check profile permissions and try again.'
            : 'Could not save key. Unlock your system keychain, check disk space and profile permissions, then try again.',
      }));
      return;
    } finally {
      pending.current.delete(providerId);
      setBusy((current) => ({ ...current, [providerId]: false }));
    }
    if (value !== null) onKeySaved?.();
    onKeyChange?.();
  };

  const handleSave = (providerId: string) => {
    const trimmed = (inputs[providerId] || '').trim();
    if (trimmed) void changeKey(providerId, trimmed);
  };

  return (
    <div className="space-y-3">
      {providerIds.map((providerId, idx) => {
        const provider = PROVIDERS[providerId]!;
        const agent = agents[providerId] ?? null;
        const Icon = PROVIDER_ICONS[providerId];
        const hint = hints[providerId];
        const input = inputs[providerId] || '';
        // Ollama / LM Studio run on this machine: nothing to paste, nothing to remove
        const local = isLocalModel(provider.defaultModel);

        return (
          <div
            key={providerId}
            className="rounded-[var(--radius)] border border-border bg-[color-mix(in_srgb,var(--surface),transparent_50%)] p-4 space-y-3"
          >
            {/* Header row: icon + name + status */}
            <div className="flex items-center justify-between min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                {Icon && <Icon size={18} />}
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-body font-medium text-text hover:text-accent  underline decoration-text-muted/(--tint-quiet) underline-offset-2 hover:decoration-accent"
                >
                  {provider.name}
                </a>
                {isAgentModel(providerId) ? (
                  <span
                    className="text-xs font-mono text-subtle"
                    data-testid={`${providerId}-status`}
                  >
                    {agent === null
                      ? `Looking for ${provider.name}…`
                      : agent.installed && !agent.reason
                        ? `Installed${agent.version ? ` · ${agent.version}` : ''} — uses your ${provider.name} login, no key here`
                        : (agent.reason ??
                          `Install ${provider.name} and sign in, then reopen Settings`)}
                  </span>
                ) : local ? (
                  <span className="text-xs font-mono text-subtle">
                    No key needed — runs on this machine
                  </span>
                ) : hint ? (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] text-accent bg-accent-muted">
                    {hint}
                  </span>
                ) : (
                  <span className="text-xs font-mono text-subtle">
                    {loading
                      ? 'Loading…'
                      : errors[providerId]
                        ? 'Key unavailable'
                        : 'Not configured'}
                  </span>
                )}
              </div>
            </div>

            {/* Capabilities */}
            <div className="flex flex-wrap items-center gap-1.5">
              {provider.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-2xs font-mono px-2 py-0.5 rounded-full bg-surface text-text-muted border border-border"
                >
                  {cap}
                </span>
              ))}
            </div>

            {/* Key input */}
            {!local && !isAgentModel(providerId) && (
              // Wraps rather than clips in a narrow Settings pane at large text.
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  disabled={loading || busy[providerId]}
                  value={input}
                  autoFocus={autoFocus && idx === 0}
                  onChange={(e) => setInputs((v) => ({ ...v, [providerId]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave(providerId);
                  }}
                  placeholder={
                    hint
                      ? 'Replace key...'
                      : PROVIDER_PLACEHOLDERS[providerId] || 'Paste API key...'
                  }
                  className={cn(
                    'flex-1 basis-40 min-w-0 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                    'bg-bg border border-border text-text placeholder:text-placeholder',
                    'outline-none focus:border-input-border-active ',
                  )}
                />
                <button
                  onClick={() => handleSave(providerId)}
                  disabled={loading || busy[providerId] || !input.trim()}
                  className={cn(
                    'shrink-0 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                    'bg-surface border border-border text-text hover:bg-accent-muted  cursor-pointer',
                    'disabled:cursor-not-allowed',
                  )}
                >
                  Save
                </button>
                {hint && (
                  <button
                    onClick={() => void changeKey(providerId, null)}
                    disabled={loading || busy[providerId]}
                    className={cn(
                      'shrink-0 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                      'text-error hover:bg-error-muted  cursor-pointer',
                    )}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
            {errors[providerId] && (
              <p role="alert" className="text-xs text-error">
                {errors[providerId]}
              </p>
            )}
            {checks[providerId] && !errors[providerId] && (
              <p
                role="status"
                data-testid={`${providerId}-key-check`}
                data-state={checks[providerId]}
                className={cn(
                  'text-xs',
                  checks[providerId] === 'refused'
                    ? 'text-error'
                    : checks[providerId] === 'valid'
                      ? 'text-accent'
                      : 'text-text-muted',
                )}
              >
                {keyCheckMessage(checks[providerId]!, provider.name)}
              </p>
            )}
          </div>
        );
      })}

      {!compact && (
        <p className="text-xxs text-subtle mt-2">
          Your keys are encrypted on this device using system credential storage and sent only to
          the AI provider you choose.
        </p>
      )}
    </div>
  );
}
