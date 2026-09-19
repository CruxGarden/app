import { includedUsage } from '@/api/inference';
import { useAuthStore } from '@/stores/authStore';
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import { PROVIDERS, isAgentModel } from '@/ai/providers';
import { Capability, can } from '@/lib/platform';
import { agentStatus } from '@/services/agent-provider';
import type { AgentStatus } from '../../../electron/src/bridge';
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
import { AnimatePresence, motion } from 'motion/react';
import { useMotionRole } from '@/hooks/useMotionRole';
import GlassSurface from '@/components/ui/GlassSurface';

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
  const accountId = useAuthStore((s) => s.account?.id);
  const [included, setIncluded] = useState(false);
  const [open, setOpen] = useState(false);
  const [localEndpoints, setLocalEndpoints] = useState<LocalAiEndpoint[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /**
   * Where the menu opens, and how tall it may be.
   *
   * The pane normally sits at the bottom of the window, so the menu opens
   * upward. But the control row moves — expanding the model info panel pushes
   * the button near the top — and a height capped against the viewport is not
   * a height that fits above the button. Measure the real room on both sides
   * and cap against that, or the list opens off the top edge.
   */
  const [placement, setPlacement] = useState<{ side: 'top' | 'bottom'; maxHeight: number }>({
    side: 'top',
    maxHeight: 0,
  });

  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 8;
      const above = rect.top - gap;
      const below = window.innerHeight - rect.bottom - gap;
      const cap = window.innerHeight * 0.6;
      // Keep opening upward while there is real room; flip only when below is
      // genuinely roomier, so the common case does not move under the cursor.
      const side = above >= below ? 'top' : 'bottom';
      const room = side === 'top' ? above : below;
      // A floor keeps the menu usable (and scrollable) in a cramped pane
      // rather than collapsing to a sliver.
      setPlacement({ side, maxHeight: Math.max(140, Math.min(cap, room)) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // Re-probe local servers each time the menu opens (fast when none run),
  // so the list tracks the user starting/stopping Ollama or LM Studio.
  useEffect(() => {
    if (open) {
      detectLocalEndpoints(true).then(setLocalEndpoints);
      // Claude Code (ADR 0019) is offered only where a binary exists — desktop, installed.
      if (can(Capability.AgentHost))
        for (const provider of Object.values(PROVIDERS).filter((provider) => provider.agent)) {
          void agentStatus(true, provider.id).then((status) =>
            setAgents((current) => ({ ...current, [provider.id]: status })),
          );
        }
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    setIncluded(false);
    if (open && accountId)
      void includedUsage()
        .then((u) => {
          if (!cancelled) setIncluded(u.available && u.eligible);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);
  const groups = getAllModels().filter(
    (g) => !isAgentModel(g.providerId) && (g.providerId !== 'included' || included),
  );
  const agentGroups = getAllModels().filter((g) => isAgentModel(g.providerId));
  const label = getModelLabel(value);
  const provider = getProviderLabel(value);
  const providerId = getProviderId(value);
  const SelectedIcon = PROVIDER_ICONS[providerId];
  const role = useMotionRole('dropdown');

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        data-testid="model-selector"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 text-xxs font-mono rounded transition-colors cursor-pointer',
          'bg-accent-muted text-accent',
          'disabled:cursor-not-allowed',
        )}
      >
        {SelectedIcon && <SelectedIcon size={12} />}
        {/* An agent provider has one model named after itself; "Claude Code
            Claude Code" told the person nothing twice. */}
        {provider !== label && <span className="text-text-muted">{provider}</span>}
        <span>{label}</span>
        <ChevronDownIcon
          size={8}
          strokeWidth={2.5}
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="models"
            data-testid="model-selector-menu"
            data-motion-role="dropdown"
            initial={role.initial}
            animate={role.animate}
            exit={role.exit}
            data-placement={placement.side}
            className={cn(
              'absolute left-0 z-50 min-w-48',
              placement.side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            <GlassSurface role="dropdown">
              <div
                style={{ maxHeight: placement.maxHeight || undefined }}
                className="w-full overflow-y-auto bg-model-selector-dropdown border border-model-selector-border rounded-dropdown shadow-dropdown py-1"
              >
                {groups.map((group) => (
                  <div key={group.providerId}>
                    {(() => {
                      const Icon = PROVIDER_ICONS[group.providerId];
                      return (
                        <div className="px-3 py-1 text-2xs font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
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

                {/* Claude Code — the person's own agent, run in the Project Folder (ADR 0019) */}
                {agentGroups.map((agentGroup) => {
                  const agent = agents[agentGroup.providerId];
                  if (!agent) return null;
                  const available = agent.installed && !agent.reason;
                  return (
                    <div
                      key={agentGroup.providerId}
                      data-testid={`model-group-${agentGroup.providerId}`}
                    >
                      <div className="px-3 py-1 text-2xs font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                        {(() => {
                          const Icon = PROVIDER_ICONS[agentGroup.providerId];
                          return Icon ? <Icon size={10} /> : null;
                        })()}
                        Your agent
                      </div>
                      {agentGroup.models.map((model) => (
                        <button
                          key={model.id}
                          disabled={!available}
                          title={
                            available ? (agent.version ?? undefined) : (agent.reason ?? undefined)
                          }
                          onClick={() => {
                            onChange(model.id);
                            setOpen(false);
                          }}
                          className={cn(
                            'w-full px-3 py-1.5 text-left text-xs font-mono transition-colors',
                            !available
                              ? 'text-text-muted/60 cursor-not-allowed'
                              : model.id === value
                                ? 'text-accent bg-accent-muted cursor-pointer'
                                : 'text-text hover:bg-accent-muted cursor-pointer',
                          )}
                        >
                          {model.name}
                          {!available && (
                            <span className="ml-1.5 text-2xs text-text-muted/70">
                              · {agent.installed ? 'unavailable' : 'not installed'}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}

                {/* Local inference (desktop, running servers only) */}
                {localEndpoints.map((endpoint) => (
                  <div key={endpoint.id}>
                    <div className="px-3 py-1 text-2xs font-mono text-text-muted uppercase tracking-wider">
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
                            <span className="ml-1.5 text-2xs text-accent/70">· tools</span>
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
            </GlassSurface>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
