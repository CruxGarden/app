import { useState, useRef, useCallback } from 'react';
import { PROVIDERS } from '@/ai/providers';
import { PROVIDER_ICONS } from '@/components/ui/ProviderIcons';
import { cn } from '@/lib/cn';
import { useDismiss } from '@/hooks/useDismiss';

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

/** Flatten all provider models into a grouped list */
function getAllModels() {
  return Object.values(PROVIDERS).map((provider) => ({
    provider: provider.name,
    providerId: provider.id,
    models: provider.models,
  }));
}

/** Find display label for a model ID */
function getModelLabel(modelId: string): string {
  for (const provider of Object.values(PROVIDERS)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model.name;
  }
  return modelId;
}

/** Find provider ID for a model ID */
function getProviderId(modelId: string): string {
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.models.some((m) => m.id === modelId)) return provider.id;
  }
  return '';
}

/** Find provider name for a model ID */
function getProviderLabel(modelId: string): string {
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.models.some((m) => m.id === modelId)) return provider.name;
  }
  return '';
}

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

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
          'disabled:cursor-not-allowed disabled:opacity-50',
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
        <div className="absolute left-0 bottom-full mb-1 z-50 min-w-48 max-h-[60vh] overflow-y-auto bg-surface-solid border border-border rounded-[var(--radius-sm)] shadow-xl py-1">
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
        </div>
      )}
    </div>
  );
}
