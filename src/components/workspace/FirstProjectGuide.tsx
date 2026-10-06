import GuideLink from '@/components/explore/GuideLink';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { getSetting, setSetting } from '@/services/settings';
import { buttonClass } from '@/components/ui/button-class';
import type { ContentModel } from '@/templates';

const steps = [
  {
    title: 'Make it yours',
    action: 'Edit my home page',
    text: 'Add your name, a short introduction and a photo in the form below. Changes save automatically. These files are yours, on your computer; nothing is public yet.',
  },
  {
    title: 'See your page',
    action: 'Preview my page',
    text: 'Look at your page as a visitor would. The first preview downloads the Astro dependencies and may take a minute. Use step 1 whenever you want to change something.',
  },
  {
    title: 'Watch it grow',
    action: 'Open Growth',
    text: 'Optional: your work already saves automatically. In Growth, choose Mark version, give this moment a name and save it. You can return to that version as you experiment. Routine saves also appear under Edits.',
  },
  {
    title: 'Share it',
    action: 'Open Share',
    text: 'Ready for visitors? Open Share, review what will be public and publish to crux.garden to get your internet link. Sign in there if needed. Test locally first is optional: it saves a separate website copy on this computer without changing your live site.',
  },
];

/** Template-declared guidance uses the ordinary form, preview, Growth and Share. */
export default function FirstProjectGuide({
  model,
  onEdit,
  onPreview,
}: {
  model: ContentModel;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const advancedMode = useAdvancedMode();
  const crux = useCruxStore((state) => state.crux)!;
  const [expanded, setExpanded] = useState(() =>
    crux.meta?.setupStartKind ? crux.meta.setupStartKind === 'guided' : !advancedMode,
  );
  const ui = useWorkspaceUIStore((state) => state);
  const key = `cruxgarden:first-project:${crux.id}`;
  const [step, setStep] = useState(() =>
    Math.min(3, Math.max(0, Math.floor(Number(getSetting(key))) || 0)),
  );
  const current = steps[step]!;
  const run = () => {
    if (step === 0) onEdit();
    else if (step === 1) onPreview();
    else {
      const pane = step === 2 ? 'history' : 'publish';
      ui.setPaneVisible(pane, true);
      ui.setMobileActivePane(pane);
    }
  };
  return (
    <details
      className="shrink-0 max-h-[35%] overflow-y-auto border-b border-border bg-surface px-3 py-2"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium text-accent">
        {model.guide!.title}
      </summary>
      <div className="mt-2 space-y-3 max-w-3xl">
        <p className="text-xs text-text-muted">{model.guide!.introduction}</p>
        <nav aria-label="Home page walkthrough" className="flex flex-wrap gap-2">
          {[0, 1, 3, 2].map((index, position) => (
            <button
              key={steps[index]!.title}
              aria-current={step === index ? 'step' : undefined}
              className={buttonClass(step === index ? 'primary' : 'secondary', 'xs')}
              onClick={() => {
                setStep(index);
                setSetting(key, String(index));
              }}
            >
              {index === 2 ? 'Optional: ' : `${position + 1}. `}
              {steps[index]!.title}
            </button>
          ))}
        </nav>
        <p className="text-sm text-text-muted">{current.text}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className={buttonClass('secondary', 'sm')} onClick={run}>
            {current.action}
          </button>
          <GuideLink page="start/first-home/">Step-by-step help</GuideLink>
        </div>
        {!!crux.meta?.publishedAt && (
          <p role="status" className="text-sm text-accent">
            Your page has been shared. Open Share to copy its link or publish your next changes.
          </p>
        )}
      </div>
    </details>
  );
}
