import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, linkClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { gardenPath, useGardenContext } from '@/stores/gardenContext';
import { toast } from '@/stores/toastStore';
import { applySetup } from './setup-finish';
import {
  abandonSetup,
  createFirstCrux,
  forgetMoodPreview,
  playPlantedCue,
  restoreMood,
  setupDeps,
  setupStartFor,
} from './setup-actions';
import {
  SETUP_STEPS,
  usernameFormatError,
  type CatalogEntry,
  type SetupMode,
  type SetupStepId,
} from './setup-plan';
import { growthStage, nextStep, previousStep, useSetupWizard } from './setup-store';
import GardenGrowth from './GardenGrowth';
import { useStillMotion } from './useStillMotion';
import StepNeed from './StepNeed';
import StepGarden from './StepGarden';
import StepAi from './StepAi';
import StepMood from './StepMood';
import StepFirstCrux from './StepFirstCrux';

const STEPS: Record<SetupStepId, { short: string; title: string; lead: string }> = {
  need: {
    short: 'Make',
    title: 'What would you like to make?',
    lead: 'Pick the closest. We’ll suggest places to start, and you can make anything later.',
  },
  garden: {
    short: 'Garden',
    title: 'Your garden',
    lead: 'Everything you make grows here, on this computer.',
  },
  ai: {
    short: 'Collaborators',
    title: 'Would you like a collaborator?',
    lead: 'A helper who can talk ideas through and make changes with you. Entirely optional.',
  },
  mood: {
    short: 'Mood',
    title: 'Choose a Mood',
    lead: 'Colours, background and sound. Pick one and watch the garden change.',
  },
  crux: {
    short: 'Ready',
    title: 'Ready to plant',
    lead: 'Check your choices, then plant your garden.',
  },
};

/** With No AI chosen, nothing on screen speaks of collaborators (AI Tools off = nothing AI). */
const BY_HAND = {
  short: 'By hand',
  title: 'How would you like to work?',
  lead: 'Everything works by hand: forms, editors and tools.',
};
const copyFor = (id: SetupStepId, noAi: boolean) => (id === 'ai' && noAi ? BY_HAND : STEPS[id]);

type After = { kind: 'stay' } | { kind: 'home' } | { kind: 'crux'; entry: CatalogEntry };

/**
 * The Setup wizard (ROADMAP § Setup wizard): first run by need → garden →
 * collaborators → Mood → "Here's your garden" and the first Crux. A small
 * garden grows a stage per step and blooms when it is planted. Every step has
 * Back and Later; Skip setup applies the defaults and lands at Home (Esc asks
 * first). Run again from Settings or Help, it starts from today's choices and
 * changes only what the person changes.
 */
export default function SetupWizard({
  mode,
  onCancel,
  onDone,
}: {
  mode: SetupMode;
  /** Leave without applying anything (first run: back to the Gateway's choices). */
  onCancel: () => void;
  /** After the choices are applied (again: close the dialog). */
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const state = useSetupWizard();
  const still = useStillMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [confirmSkip, setConfirmSkip] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    useSetupWizard.getState().begin(setupStartFor(mode));
  }, [mode]);

  // A new step is announced by moving focus to its heading.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [state.step]);

  // First run: Esc asks whether to skip setup (in the dialog, Esc closes it).
  useEffect(() => {
    if (mode !== 'first') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('[data-modal-open]')) return;
      e.preventDefault();
      setConfirmSkip(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  if (!state.active || state.mode !== mode) return null;

  const index = SETUP_STEPS.indexOf(state.step);
  const step = copyFor(state.step, state.noAi);
  const stage = growthStage(state);

  const checkUsername = async (): Promise<boolean> => {
    const name = useSetupWizard.getState().username.trim();
    const format = usernameFormatError(name);
    if (format) {
      setUsernameError(format);
      return false;
    }
    if (!name || !useAuthStore.getState().isAuthenticated) return true;
    try {
      const { authors } = await import('@/api');
      const current = (await import('@/stores/appStore')).useAppStore.getState().author?.username;
      if (current === name) return true;
      const { available } = await authors.checkUsername(name.toLowerCase());
      if (!available) {
        setUsernameError('Someone already has that name at crux.garden. Try another?');
        return false;
      }
    } catch {
      /* crux.garden unreachable: the local name is kept */
    }
    return true;
  };

  /** `skipping`: a name that cannot be used is dropped rather than stopping the skip. */
  const finish = async (after: After, skipping = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setConfirmSkip(false);
    try {
      if (!(await checkUsername())) {
        if (!skipping) {
          useSetupWizard.getState().goTo('garden');
          setBusy(false);
          return;
        }
        useSetupWizard.getState().set({ username: '' });
        setUsernameError('');
      }
      const choices = useSetupWizard.getState();
      // A preview that is not the choice goes back first; the choice is worn for real below.
      if (!choices.moodId || choices.moodId === choices.moodAtStart) await restoreMood();
      await applySetup(choices, setupDeps(choices.mode));
      forgetMoodPreview();

      // The garden blooms while the first Crux is made.
      const celebrate = mode === 'first' || after.kind === 'crux';
      if (celebrate) {
        useSetupWizard.getState().set({ planted: true });
        void playPlantedCue();
      }
      const pause = celebrate
        ? new Promise((resolve) => setTimeout(resolve, still ? 900 : 1600))
        : Promise.resolve();
      let to: string | null = null;
      if (after.kind === 'crux')
        to = await createFirstCrux(after.entry, choices.cruxTitle, {
          mode: choices.mode,
          need: choices.need,
          advancedMode: choices.advancedMode,
          startKind: choices.startKind ?? (choices.advancedMode ? 'template' : 'guided'),
        });
      else if (after.kind === 'home') {
        const garden = useGardenContext.getState().garden;
        to = mode === 'first' || !garden ? '/home' : gardenPath(garden.id);
      }
      await pause;
      useSetupWizard.getState().reset();
      onDone?.();
      if (after.kind === 'stay') toast('Saved. Your garden is up to date.');
      if (to) navigate(to, { replace: mode === 'first' });
    } catch (err) {
      useSetupWizard.getState().set({ planted: false });
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Your garden could not be planted. Try again.',
      );
      setBusy(false);
    }
  };

  const cancel = () => {
    if (busy) return;
    void abandonSetup();
    onCancel();
  };

  const forward = async () => {
    if (busy) return;
    if (state.step === 'garden' && !(await checkUsername())) return;
    state.next();
  };

  const keepMood = () => {
    void restoreMood().catch(() => {});
    state.set({ moodId: null });
  };

  const later = () => {
    if (busy) return;
    if (state.step === 'garden' && usernameFormatError(state.username.trim())) {
      state.set({ username: '' });
      setUsernameError('');
    }
    if (state.step === 'mood') keepMood();
    state.next();
  };

  const back = () => {
    if (previousStep(state)) state.back();
    else cancel();
  };

  // Enter continues from a choice or a plain field; fields with their own Enter keep it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (state.step === 'crux') return;
    const target = e.target as HTMLElement;
    const radio = target instanceof HTMLInputElement && target.type === 'radio';
    if (!radio && !('enterContinues' in target.dataset)) return;
    e.preventDefault();
    void forward();
  };

  const name = state.gardenName.trim() || 'My Garden';

  return (
    <div
      className="flex flex-col flex-1 min-h-0 gap-4"
      data-testid="setup-wizard"
      data-step={state.step}
      data-mode={mode}
      data-planted={state.planted ? 'true' : 'false'}
      data-no-drag=""
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-3">
        <GardenGrowth
          stage={stage}
          stages={SETUP_STEPS.length}
          label={
            state.planted
              ? `${name} is planted and in bloom`
              : `Your garden is growing: step ${index + 1} of ${SETUP_STEPS.length}`
          }
        />
        <nav aria-label="Setup steps" className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {SETUP_STEPS.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                {i < index && !state.planted ? (
                  <button
                    type="button"
                    className={linkClass('text-text-muted hover:text-accent')}
                    aria-label={`${copyFor(id, state.noAi).short}, done. Go back to it`}
                    onClick={() => state.goTo(id)}
                    disabled={busy}
                  >
                    {copyFor(id, state.noAi).short} ✓
                  </button>
                ) : (
                  <span
                    aria-current={i === index && !state.planted ? 'step' : undefined}
                    className={cn(
                      i === index && !state.planted
                        ? 'text-accent font-medium'
                        : state.planted
                          ? 'text-accent'
                          : 'text-text-muted',
                    )}
                  >
                    {copyFor(id, state.noAi).short}
                  </span>
                )}
                {i < SETUP_STEPS.length - 1 && (
                  <span aria-hidden className="text-text-muted">
                    ·
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {mode === 'first' && !state.planted && (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => void finish({ kind: 'home' }, true)}
          >
            Skip setup
          </Button>
        )}
      </div>

      {state.planted ? (
        <div
          role="status"
          aria-live="polite"
          className="motion-enter-card flex flex-col items-center gap-1 py-8 text-center"
          data-testid="setup-planted"
        >
          <p className="font-display text-lg text-accent">Your garden is planted</p>
          <p className="text-sm text-text-muted">
            {name} is ready. {busy ? 'Opening it now…' : ''}
          </p>
        </div>
      ) : (
        <>
          <div key={state.step} className="motion-enter-card">
            <h2
              ref={heading}
              tabIndex={-1}
              className="font-display text-base font-medium text-accent outline-none"
            >
              {step.title}
            </h2>
            <p className="text-xs text-text-muted mt-1">{step.lead}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 pb-1">
            {state.step === 'need' && <StepNeed />}
            {state.step === 'garden' && (
              <StepGarden usernameError={usernameError} onUsernameError={setUsernameError} />
            )}
            {state.step === 'ai' && <StepAi />}
            {state.step === 'mood' && <StepMood />}
            {state.step === 'crux' && (
              <StepFirstCrux
                busy={busy}
                onCreate={(entry) => void finish({ kind: 'crux', entry })}
                onNotNow={() => void finish(mode === 'first' ? { kind: 'home' } : { kind: 'stay' })}
                onSave={() => void finish({ kind: 'stay' })}
              />
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      {!state.planted && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {(mode === 'first' || index > 0) && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={back}>
              Back
            </Button>
          )}
          <span className="flex-1" />
          {state.step !== 'crux' && (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={later}>
                {state.step === 'mood'
                  ? mode === 'first'
                    ? 'Keep the default'
                    : 'Keep my Mood'
                  : 'Later'}
              </Button>
              <Button
                size="sm"
                loading={busy}
                disabled={state.step === 'garden' && !!usernameError}
                onClick={() => void forward()}
              >
                {state.returnToSummary
                  ? 'Back to summary'
                  : nextStep(state) === 'crux'
                    ? 'Almost there'
                    : 'Continue'}
              </Button>
            </>
          )}
        </div>
      )}

      <Modal
        open={confirmSkip}
        onClose={() => setConfirmSkip(false)}
        title="Skip setup?"
        size="sm"
        layer="top"
        role="alertdialog"
      >
        <p className="text-sm text-text-muted">
          Your garden will be planted with the defaults, keeping anything you chose so far. You can
          run setup again any time from Help.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={() => setConfirmSkip(false)}>
            Keep going
          </Button>
          <Button size="sm" autoFocus onClick={() => void finish({ kind: 'home' }, true)}>
            Skip setup
          </Button>
        </div>
      </Modal>
    </div>
  );
}
