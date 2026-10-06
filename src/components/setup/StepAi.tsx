import { useEffect, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { CollaboratorSection, ImagesSection } from './CollaboratorSections';
import { CodingAgentsSection, LocalModelsSection, OutsideAgentSection } from './ComputerSections';
import {
  SECTION_TIER,
  disclosuresFor,
  firstSectionFor,
  offeredSections,
  visibleSections,
  type AiSection,
} from './setup-plan';
import { useSetupWizard } from './setup-store';
import { Disclosure, ReadyMark, Recommended } from './setup-ui';
import { useSavedKeys } from './useSavedKeys';

/**
 * Step 3 — how you'll use AI. The plain choice first (with a collaborator, or
 * No AI); then the two things most people want; then "More options" and "For
 * developers", folded unless step 1 asked for them. Each section shows its
 * status and Set up / Later. No AI folds everything else away.
 */
export default function StepAi() {
  const noAi = useSetupWizard((s) => s.noAi);
  const advancedMode = useSetupWizard((s) => s.advancedMode);
  const openSection = useSetupWizard((s) => s.openSection);
  const moreOpen = useSetupWizard((s) => s.moreOpen);
  const developersOpen = useSetupWizard((s) => s.developersOpen);
  const set = useSetupWizard((s) => s.set);
  const offered = useMemo(
    () =>
      offeredSections({
        advancedMode,
        localInference: can(Capability.LocalInference),
        agentHost: can(Capability.AgentHost),
      }),
    [advancedMode],
  );
  const sections = visibleSections(noAi, offered);
  const saved = useSavedKeys();

  // What step 1 asked for opens by itself, once per answer.
  useEffect(() => {
    const state = useSetupWizard.getState();
    if (state.aiSeeded) return;
    const folds = disclosuresFor(state.need, offered);
    set({
      aiSeeded: true,
      openSection: state.noAi ? null : firstSectionFor(state.need, offered),
      moreOpen: state.moreOpen || folds.more,
      developersOpen: state.developersOpen || folds.developers,
    });
  }, [offered, set]);

  const props = (id: AiSection) => ({
    open: openSection === id,
    onOpen: () => set({ openSection: id }),
    onLater: () => set({ openSection: null }),
  });
  const inTier = (tier: string) => sections.some((s) => SECTION_TIER[s] === tier);

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="min-w-0">
        <legend className="sr-only">Would you like a collaborator?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Choice
            name="setup-ai"
            checked={!noAi}
            onChange={() => set({ noAi: false })}
            title="With a collaborator"
            badge={<Recommended />}
            description="Talk ideas through and get a hand making things."
          />
          <Choice
            name="setup-ai"
            checked={noAi}
            onChange={() => set({ noAi: true, openSection: null })}
            title="No AI"
            description="Make everything by hand with forms, editors and tools."
          />
        </div>
      </fieldset>

      {noAi ? (
        <p className="text-xs text-text-muted" aria-live="polite">
          Everything works by hand. You can change this later in Settings.
        </p>
      ) : (
        <>
          <p className="text-xs text-text-muted">
            Everything here is optional. Set up what you like; the rest can wait.
          </p>
          {sections.includes('collaborator') && (
            <CollaboratorSection {...props('collaborator')} saved={saved} />
          )}
          {sections.includes('images') && <ImagesSection {...props('images')} saved={saved} />}
          {inTier('more') && (
            <Disclosure
              label="More options"
              hint="a model on this computer"
              open={moreOpen}
              onToggle={(open) => set({ moreOpen: open })}
              testId="setup-ai-more"
            >
              {sections.includes('local') && <LocalModelsSection {...props('local')} />}
            </Disclosure>
          )}
          {inTier('developers') && (
            <Disclosure
              label="For developers"
              hint="Claude Code, Codex, the crux command, MCP"
              open={developersOpen}
              onToggle={(open) => set({ developersOpen: open })}
              testId="setup-ai-developers"
            >
              {sections.includes('agents') && <CodingAgentsSection {...props('agents')} />}
              {sections.includes('outside') && <OutsideAgentSection {...props('outside')} />}
            </Disclosure>
          )}
        </>
      )}
    </div>
  );
}

/** A big, plain radio card. */
function Choice({
  name,
  checked,
  onChange,
  title,
  description,
  badge,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] border cursor-pointer',
        'transition-[color,background-color,border-color] motion-press',
        'focus-within:ring-2 focus-within:ring-input-outline',
        checked
          ? 'bg-accent-muted border-accent'
          : 'bg-surface border-border hover:bg-action-button-hover hover:border-action-button-border-hover',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-sm font-medium', checked ? 'text-accent' : 'text-text')}>
            {title}
          </span>
          {badge}
        </span>
        <span className="text-xs text-text-muted">{description}</span>
      </span>
      {checked && <ReadyMark />}
    </label>
  );
}
