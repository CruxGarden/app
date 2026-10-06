import { useState } from 'react';
import { Button } from '@/components/ui';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { FIRST_ACTIVITY } from '@/components/setup/setup-workspace';
import type { SetupNeed } from '@/components/setup/setup-plan';

/** A first activity for tools without their own walkthrough; never overlays their controls. */
export default function SetupProjectGuide({
  need,
  dismissed,
}: {
  need: SetupNeed;
  dismissed?: boolean;
}) {
  const patch = useCruxStore((s) => s.patchCruxMeta);
  const save = useCruxStore((s) => s.saveMeta);
  const ui = useWorkspaceUIStore((s) => s);
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState(!dismissed);
  const activity = FIRST_ACTIVITY[need] ?? FIRST_ACTIVITY.exploring;
  const titles = [activity.action, 'Keep a version', 'Use or share your work'];
  const text = [
    activity.text,
    'Your edits save automatically. Open Growth and mark a version when you want a named point to return to.',
    'Keep working locally, export a copy, or open Share when you want visitors. Review what will be included before publishing.',
  ];
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="shrink-0 border-b border-border bg-surface px-4 py-3"
      data-testid="setup-project-guide"
    >
      <summary className="text-sm font-medium text-accent cursor-pointer">{activity.title}</summary>
      <nav aria-label="First Crux walkthrough" className="flex flex-wrap gap-2 mt-2">
        {titles.map((title, i) => (
          <Button
            key={title}
            size="xs"
            variant={step === i ? 'primary' : 'secondary'}
            onClick={() => setStep(i)}
          >
            {i + 1}. {title}
          </Button>
        ))}
      </nav>
      <p className="text-sm text-text-muted my-2">{text[step]}</p>
      <div className="flex flex-wrap gap-2">
        {step > 0 && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              const pane = step === 1 ? 'history' : 'publish';
              ui.setPaneVisible(pane, true);
              ui.setMobileActivePane(pane);
            }}
          >
            {step === 1 ? 'Open Growth' : 'Open Share'}
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setExpanded(false);
            patch({ setupGuide: { need, dismissed: true } });
            void save();
          }}
        >
          Finish walkthrough
        </Button>
      </div>
    </details>
  );
}
