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
    text: 'In Growth, choose Mark version, give this moment a name and save it. You can return to that version as you experiment. Routine saves also appear under Edits.',
  },
  {
    title: 'Share it',
    action: 'Open Share',
    text: 'Ready for visitors? Connect your crux.garden account in Share, review what will be public, then press Share. It builds your site and gives you a link. You can keep editing locally and share updates when you choose.',
  },
];

/** Template-declared guidance uses the ordinary form, preview, Growth and Share. */
export default function FirstProjectGuide({ model }: { model: ContentModel }) {
  const crux = useCruxStore((state) => state.crux)!;
  const artifacts = useCruxStore((state) => state.artifacts);
  const ui = useWorkspaceUIStore((state) => state);
  const key = `cruxgarden:first-project:${crux.id}`;
  const [step, setStep] = useState(() =>
    Math.min(3, Math.max(0, Math.floor(Number(getSetting(key))) || 0)),
  );
  const current = steps[step]!;
  const run = () => {
    if (step === 0) {
      const path = model.settings?.path;
      const file = artifacts.find(
        (artifact) => (artifact.meta?.path || artifact.filename) === path,
      );
      if (file && path) {
        ui.openFile(file.id, path);
        ui.setTabViewMode(file.id, 'form');
      }
    } else if (step === 1) ui.setWorkshopView('clean');
    else {
      const pane = step === 2 ? 'history' : 'publish';
      ui.setPaneVisible(pane, true);
      ui.setMobileActivePane(pane);
    }
  };
  return (
    <details className="shrink-0 border-b border-border bg-surface px-4 py-3" open>
      <summary className="cursor-pointer text-sm font-medium text-accent">
        {model.guide!.title}
      </summary>
      <div className="mt-2 space-y-3 max-w-3xl">
        <p className="text-xs text-text-muted">{model.guide!.introduction}</p>
        <nav aria-label="Home page walkthrough" className="flex flex-wrap gap-2">
          {steps.map((item, index) => (
            <button
              key={item.title}
              aria-current={step === index ? 'step' : undefined}
              className={buttonClass(step === index ? 'primary' : 'secondary', 'xs')}
              onClick={() => {
                setStep(index);
                setSetting(key, String(index));
              }}
            >
              {index + 1}. {item.title}
            </button>
          ))}
        </nav>
        <p className="text-sm text-text-muted">{current.text}</p>
        <button className={buttonClass('secondary', 'sm')} onClick={run}>
          {current.action}
        </button>
        {!!crux.meta?.publishedAt && (
          <p role="status" className="text-sm text-accent">
            Your page has been shared. Open Share to copy its link or publish your next changes.
          </p>
        )}
      </div>
    </details>
  );
}
