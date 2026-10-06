import { cn } from '@/lib/cn';
import { NEEDS } from './setup-plan';
import NeedPreview from './NeedPreview';
import { ReadyMark, Recommended } from './setup-ui';
import { useSetupWizard } from './setup-store';

/** Step 1 — what the person wants to make. Native radios: arrows and Space work as expected. */
export default function StepNeed() {
  const need = useSetupWizard((s) => s.need);
  const set = useSetupWizard((s) => s.set);
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">What do you want to make?</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {NEEDS.map((choice) => {
          const selected = need === choice.id;
          return (
            <label
              key={choice.id}
              data-need={choice.id}
              className={cn(
                'relative flex flex-col px-3 py-2.5 rounded-[var(--radius-sm)] border cursor-pointer',
                'transition-[color,background-color,border-color] motion-press',
                'focus-within:ring-2 focus-within:ring-input-outline',
                selected
                  ? 'bg-accent-muted border-accent text-text'
                  : 'bg-surface border-border text-text hover:bg-action-button-hover hover:border-action-button-border-hover',
              )}
            >
              <input
                type="radio"
                name="setup-need"
                value={choice.id}
                checked={selected}
                onChange={() => set({ need: choice.id, aiSeeded: false })}
                className="sr-only"
              />
              <span className="flex items-start gap-3">
                <NeedPreview need={choice.id} />
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('text-sm font-medium', selected && 'text-accent')}>
                      {choice.label}
                    </span>
                    {choice.recommended && <Recommended />}
                  </span>
                  <span className="text-xs text-text-muted">{choice.description}</span>
                </span>
                {selected && <ReadyMark />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
