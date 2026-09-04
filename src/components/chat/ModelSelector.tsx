import { useState, useRef, useCallback, useEffect } from 'react';
import { PROVIDERS } from '@/ai/providers';
import {
  detectLocalEndpoints,
  isLocalModel,
  isToolCapableLocalModel,
  localModelName,
  localProviderOf,
  sortLocalModels,
} from '@/ai/local';
import type { LocalAiEndpoint } from '@/lib/platform';
import { PROVIDER_ICONS } from '@/components/ui/ProviderIcons';
import { cn } from '@/lib/cn';
import { useDismiss } from '@/hooks/useDismiss';

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

/** Flatten cloud provider models into a grouped list (local groups are dynamic) */
function getAllModels() {
  return Object.values(PROVIDERS)
    .filter((provider) => provider.models.length > 0)
    .map((provider) => ({
      provider: provider.name,
      providerId: provider.id,
      models: provider.models,
    }));
}

/** Find display label for a model ID */
function getModelLabel(modelId: string): string {
  if (isLocalModel(modelId)) return localModelName(modelId);
  for (const provider of Object.values(PROVIDERS)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model.name;
  }
  return modelId;
}

/** Find provider ID for a model ID */
function getProviderId(modelId: string): string {
  const local = localProviderOf(modelId);
  if (local) return local;
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.models.some((m) => m.id === modelId)) return provider.id;
  }
  return '';
}

/** Find provider name for a model ID */
function getProviderLabel(modelId: string): string {
  const local = localProviderOf(modelId);
  if (local) return PROVIDERS[local]?.name ?? local;
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.models.some((m) => m.id === modelId)) return provider.name;
  }
  return '';
}

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [localEndpoints, setLocalEndpoints] = useState<LocalAiEndpoint[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  // Re-probe local servers each time the menu opens (fast when none run),
  // so the list tracks the user starting/stopping Ollama or LM Studio.
  useEffect(() => {
    if (open) detectLocalEndpoints(true).then(setLocalEndpoints);
  }, [open]);

  const groups = getAllModels();
  const label = getModelLabel(value);
  const provider = getProviderLabel(value);
  const providerId = getProviderId(value);
  const SelectedIcon = PROVIDER_ICONS[providerId];

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer',
          'bg-accent-muted text-accent',
          'disabled:cursor-not-allowed',
        )}
      >
        {SelectedIcon && <SelectedIcon size={12} />}
        <span className="text-text-muted">{provider}</span>
        <span>{label}</span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={cn('transition-transform', open && 'rotate-180')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-50 min-w-48 max-h-[60vh] overflow-y-auto bg-model-selector-dropdown border border-model-selector-border rounded-dropdown shadow-dropdown py-1">
          {groups.map((group) => (
            <div key={group.providerId}>
              {(() => {
                const Icon = PROVIDER_ICONS[group.providerId];
                return (
                  <div className="px-3 py-1 text-[10px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    {Icon && <Icon size={10} />}
                    {group.provider}
                  </div>
                );
              })()}
              {group.models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs font-mono transition-colors cursor-pointer',
                    model.id === value
                      ? 'text-accent bg-accent-muted'
                      : 'text-text hover:bg-accent-muted',
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          ))}

          {/* Local inference (desktop, running servers only) */}
          {localEndpoints.map((endpoint) => (
            <div key={endpoint.id}>
              <div className="px-3 py-1 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                {endpoint.name} · local
              </div>
              {sortLocalModels(endpoint.models).map((name) => {
                const id = `${endpoint.id}/${name}`;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      onChange(id);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs font-mono transition-colors cursor-pointer',
                      id === value
                        ? 'text-accent bg-accent-muted'
                        : 'text-text hover:bg-accent-muted',
                    )}
                  >
                    {name}
                    {isToolCapableLocalModel(name) && (
                      <span className="ml-1.5 text-[10px] text-accent/70">· tools</span>
                    )}
                  </button>
                );
              })}
              {endpoint.models.length === 0 && (
                <div className="px-3 py-1.5 text-xs font-mono text-text-muted">
                  No models installed
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
