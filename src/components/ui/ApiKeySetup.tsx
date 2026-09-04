import { useState, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { getApiKey, setApiKey, removeApiKey } from '@/ai/keys';
import { PROVIDERS } from '@/ai/providers';
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
}

export default function ApiKeySetup({
  compact,
  onKeySaved,
  onKeyChange,
  autoFocus,
}: ApiKeySetupProps) {
  const providerIds = Object.keys(PROVIDERS);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // Load existing key hints on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const newHints: Record<string, string> = {};
      for (const id of providerIds) {
        const key = await getApiKey(id);
        if (key) {
          newHints[id] = `${key.slice(0, 7)}...${key.slice(-4)}`;
        }
      }
      if (!cancelled) setHints(newHints);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (providerId: string) => {
    const trimmed = (inputs[providerId] || '').trim();
    if (!trimmed) return;
    await setApiKey(providerId, trimmed);
    setHints((h) => ({ ...h, [providerId]: `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}` }));
    setInputs((v) => ({ ...v, [providerId]: '' }));
    onKeySaved?.();
    onKeyChange?.();
  };

  const handleRemove = async (providerId: string) => {
    await removeApiKey(providerId);
    setHints((h) => {
      const next = { ...h };
      delete next[providerId];
      return next;
    });
    setInputs((v) => ({ ...v, [providerId]: '' }));
    onKeyChange?.();
  };

  return (
    <div className="space-y-3">
      {providerIds.map((providerId, idx) => {
        const provider = PROVIDERS[providerId]!;
        const Icon = PROVIDER_ICONS[providerId];
        const hint = hints[providerId];
        const input = inputs[providerId] || '';

        return (
          <div
            key={providerId}
            className="rounded-[var(--radius)] border border-border bg-[color-mix(in_srgb,var(--surface),transparent_50%)] p-4 space-y-3"
          >
            {/* Header row: icon + name + status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {Icon && <Icon size={18} />}
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-display font-medium text-text hover:text-accent  underline decoration-text-muted/30 underline-offset-2 hover:decoration-accent"
                >
                  {provider.name}
                </a>
                {hint ? (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] text-accent bg-accent-muted">
                    {hint}
                  </span>
                ) : (
                  <span className="text-xs font-mono text-text-muted/50">Not configured</span>
                )}
              </div>
            </div>

            {/* Capabilities */}
            <div className="flex items-center gap-1.5">
              {provider.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface text-text-muted border border-border"
                >
                  {cap}
                </span>
              ))}
            </div>

            {/* Key input */}
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={input}
                autoFocus={autoFocus && idx === 0}
                onChange={(e) => setInputs((v) => ({ ...v, [providerId]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave(providerId);
                }}
                placeholder={
                  hint ? 'Replace key...' : PROVIDER_PLACEHOLDERS[providerId] || 'Paste API key...'
                }
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                  'bg-bg border border-border text-text placeholder:text-text-muted/50',
                  'outline-none focus:border-input-border-active ',
                )}
              />
              <button
                onClick={() => handleSave(providerId)}
                disabled={!input.trim()}
                className={cn(
                  'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                  'bg-surface border border-border text-text hover:bg-accent-muted  cursor-pointer',
                  'disabled:cursor-not-allowed',
                )}
              >
                Save
              </button>
              {hint && (
                <button
                  onClick={() => handleRemove(providerId)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                    'text-error hover:bg-error-muted  cursor-pointer',
                  )}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}

      {!compact && (
        <p className="text-[11px] text-text-muted/60 mt-2">
          Your keys are stored locally in this browser and never sent to our servers.
        </p>
      )}
    </div>
  );
}
