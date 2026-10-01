import { includedUsage } from '@/api/inference';
import { SectionLabel, menuItemClass } from '@/components/ui';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { useAuthStore } from '@/stores/authStore';
import { useState, useRef, useCallback, useEffect, useLayoutEffect, useId } from 'react';
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

  const pickerId = useId();
  const close = useCallback(() => {
    setOpen(false);
    if (menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
  }, []);
  useDismiss(menuRef, close, open);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const picker = pickerRef.current;
    (
      picker?.querySelector<HTMLElement>('button[aria-pressed="true"]:not(:disabled)') ??
      picker?.querySelector<HTMLElement>('button:not(:disabled)')
    )?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const button = buttonRef.current;
      const rect = button?.getBoundingClientRect();
      if (!button || !rect) return;
      const gap = 8;
      // The room that counts is the pane's, not the window's: the pane clips
      // whatever hangs out of it, and a menu measured against the window
      // opened downward into a pane's bottom edge and was cut off there.
      let top = 0;
      let bottom = window.innerHeight;
      for (let el = button.parentElement; el; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el);
        if (overflowY === 'visible') continue;
        const box = el.getBoundingClientRect();
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
      }
      const above = rect.top - top - gap;
      const below = bottom - rect.bottom - gap;
      const cap = window.innerHeight * 0.6;
      // Keep opening upward while there is real room; flip only when below is
      // genuinely roomier, so the common case does not move under the cursor.
      const side = above >= below ? 'top' : 'bottom';
      const room = side === 'top' ? above : below;
      // A floor keeps the menu usable (and scrollable) in a cramped pane
      // rather than collapsing to a sliver.
      setPlacement({ side, maxHeight: Math.max(120, Math.min(cap, room)) });
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
        aria-haspopup="dialog"
        aria-controls={open ? pickerId : undefined}
        aria-expanded={open}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 h-6 px-2 text-xxs font-mono rounded-[var(--radius-sm)] cursor-pointer',
          'bg-accent-muted text-accent hover-bright active-dim',
          open && 'ring-1 ring-accent/(--tint-muted)',
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

      {/* Under Plasma the picker is a raised surface of the material: the canvas sits


          beside the animated menu, not inside it — a transform would misplace a fixed


          canvas — one step below the menu in the pane's own stacking order. */}

      {open && (
        <PlasmaOverlay
          surfaces={[{ ref: pickerRef, radius: 12, elevation: 0.6 }]}
          zIndex={49}
          canvasStyle={{ position: 'fixed' }}
        />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            key="models"
            data-testid="model-selector-menu"
            id={pickerId}
            role="dialog"
            aria-label="Choose a model"
            onKeyDown={(event) => {
              const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
              if (!keys.includes(event.key)) return;
              const choices = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              ];
              if (!choices.length) return;
              event.preventDefault();
              const index = choices.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? choices.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
                      choices.length;
              choices[next]?.focus();
            }}
            onBlur={(event) => {
              if (event.relatedTarget && !menuRef.current?.contains(event.relatedTarget))
                setOpen(false);
            }}
            data-motion-role="dropdown"
            initial={role.initial}
            animate={role.animate}
            exit={role.exit}
            data-placement={placement.side}
            className={cn(
              'absolute left-0 z-50 min-w-48',
              placement.side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
            data-plasma-host
          >
            <GlassSurface role="dropdown">
              <div
                ref={pickerRef}
                style={{ maxHeight: placement.maxHeight || undefined }}
                className="w-full overflow-y-auto bg-model-selector-dropdown border border-model-selector-border rounded-dropdown shadow-dropdown p-1"
              >
                {groups.map((group) => (
                  <div key={group.providerId}>
                    {(() => {
                      const Icon = PROVIDER_ICONS[group.providerId];
                      return (
                        <SectionLabel
                          as="div"
                          tone="muted"
                          className="px-2.5 pt-2 pb-1 flex items-center gap-1.5"
                        >
                          {Icon && <Icon size={10} />}
                          {group.provider}
                        </SectionLabel>
                      );
                    })()}
                    {group.models.map((model) => (
                      <button
                        key={model.id}
                        aria-pressed={model.id === value}
                        onClick={() => {
                          onChange(model.id);
                          close();
                        }}
                        className={menuItemClass(
                          'default',
                          cn(
                            'text-xs font-mono',
                            model.id === value && 'text-accent bg-accent-muted',
                          ),
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
                      <SectionLabel
                        as="div"
                        tone="muted"
                        className="px-2.5 pt-2 pb-1 flex items-center gap-1.5"
                      >
                        {(() => {
                          const Icon = PROVIDER_ICONS[agentGroup.providerId];
                          return Icon ? <Icon size={10} /> : null;
                        })()}
                        Your agent
                      </SectionLabel>
                      {agentGroup.models.map((model) => (
                        <button
                          key={model.id}
                          aria-pressed={model.id === value}
                          disabled={!available}
                          title={
                            available ? (agent.version ?? undefined) : (agent.reason ?? undefined)
                          }
                          onClick={() => {
                            onChange(model.id);
                            close();
                          }}
                          className={menuItemClass(
                            'default',
                            cn(
                              'text-xs font-mono',
                              !available
                                ? 'text-subtle'
                                : model.id === value && 'text-accent bg-accent-muted',
                            ),
                          )}
                        >
                          {model.name}
                          {!available && (
                            <span className="ml-1.5 text-2xs text-subtle">
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
                    <SectionLabel as="div" tone="muted" className="px-2.5 pt-2 pb-1">
                      {endpoint.name} · local
                    </SectionLabel>
                    {sortLocalModels(endpoint.models).map((name) => {
                      const id = `${endpoint.id}/${name}`;
                      return (
                        <button
                          key={id}
                          aria-pressed={id === value}
                          onClick={() => {
                            onChange(id);
                            close();
                          }}
                          className={menuItemClass(
                            'default',
                            cn('text-xs font-mono', id === value && 'text-accent bg-accent-muted'),
                          )}
                        >
                          {name}
                          {isToolCapableLocalModel(name) && (
                            <span className="ml-1.5 text-2xs text-accent/(--tint-strong)">
                              · tools
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {endpoint.models.length === 0 && (
                      <div className="px-2.5 py-1.5 text-xs font-mono text-text-muted">
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
