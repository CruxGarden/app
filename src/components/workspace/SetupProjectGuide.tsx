import { executeAppTool } from '@/services/embedded-app-tool-registry';
import GuideLink from '@/components/explore/GuideLink';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { FIRST_ACTIVITY, walkthroughStep } from '@/components/setup/setup-workspace';
import type { SetupNeed } from '@/components/setup/setup-plan';

/** A first activity for tools without their own walkthrough; never overlays their controls. */
export default function SetupProjectGuide({
  need,
  dismissed,
  savedStep,
}: {
  need: SetupNeed;
  dismissed?: boolean;
  savedStep?: unknown;
}) {
  const crux = useCruxStore((s) => s.crux);
  const notebook = crux?.kind === 'notes';
  const [busy, setBusy] = useState(false);
  const guideNote = async (action: 'write' | 'choose-pages') => {
    if (!crux) return;
    setBusy(true);
    setError('');
    try {
      await executeAppTool(crux.id, 'guide_notebook', { action });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Try again when your notebook has opened.');
    } finally {
      setBusy(false);
    }
  };
  const patch = useCruxStore((s) => s.patchCruxMeta);
  const save = useCruxStore((s) => s.saveMeta);
  const ui = useWorkspaceUIStore((s) => s);
  const [step, setStep] = useState(() => walkthroughStep(savedStep));
  const [expanded, setExpanded] = useState(!dismissed);
  const [error, setError] = useState('');
  const remember = (next: number, done = false) => {
    setStep(next);
    setError('');
    patch({ setupGuide: { need, step: next, dismissed: done } });
    void save().catch(() => {
      setExpanded(true);
      setError('Your tutorial progress could not be saved. Choose the step again to retry.');
    });
  };
  const activity = FIRST_ACTIVITY[need] ?? FIRST_ACTIVITY.exploring;
  const titles = notebook
    ? ['Write a note', 'Choose public notes', 'Publish and get a link']
    : [activity.action, 'Keep a version', 'Use or share your work'];
  const text = [
    notebook
      ? 'Click Write in my note, then type a few sentences. You can change its title above the note. Wait for Saved below before leaving. Nothing is public yet.'
      : activity.text,
    notebook
      ? 'Choose only the notes you want visitors to read. You can keep the rest private. Done choosing returns you to your notebook; it does not publish anything.'
      : 'Your edits save automatically. Open Growth and mark a version when you want a named point to return to.',
    notebook
      ? 'Open Share to review your selected notes, sign in if needed, and publish. Then copy your link. Later edits stay here until you choose Update shared content.'
      : 'Keep working locally, export a copy, or open Share when you want visitors. Review what will be included before publishing.',
  ];
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="shrink-0 max-h-[35%] overflow-y-auto border-b border-border bg-surface px-3 py-2"
      data-testid="setup-project-guide"
    >
      <summary className="text-sm font-medium text-accent cursor-pointer">
        {activity.title} <span className="text-xs text-text-muted">· Step {step + 1} of 3</span>
      </summary>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-accent">All steps and more help</summary>
        <nav aria-label="First Crux walkthrough" className="flex flex-wrap gap-2 mt-2">
          {titles.map((title, i) => (
            <Button
              key={title}
              size="xs"
              variant={step === i ? 'primary' : 'secondary'}
              aria-current={step === i ? 'step' : undefined}
              onClick={() => remember(i)}
            >
              {i + 1}. {title}
            </Button>
          ))}
        </nav>
        <p className="text-xs text-text-muted my-2">
          Your edits save automatically. Growth lets you keep a named version whenever you want one.
        </p>
        <GuideLink page="guides/sharing/">Step-by-step publishing help</GuideLink>
      </details>
      <p className="text-xs text-text-muted my-2">{text[step]}</p>
      <div className="flex flex-wrap gap-2">
        {notebook && step < 2 && (
          <Button
            size="xs"
            loading={busy}
            onClick={() => void guideNote(step === 0 ? 'write' : 'choose-pages')}
          >
            {step === 0 ? 'Write in my note' : 'Choose notes to share'}
          </Button>
        )}
        {step > 0 && (!notebook || step === 2) && (
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
        {step < 2 && (
          <Button size="xs" onClick={() => remember(step + 1)}>
            {notebook ? (step === 0 ? 'Next: choose public notes' : 'Next: publish') : 'Next tip'}
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setExpanded(false);
            remember(step, true);
          }}
        >
          Hide tips
        </Button>
      </div>
      {notebook && !!crux?.meta?.publishedAt && (
        <p role="status" className="text-xs text-accent my-2">
          Your selected notes have been published. Copy the link in Share. Choose Update shared
          content to put later edits online.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error mt-2">
          {error}
        </p>
      )}
    </details>
  );
}
