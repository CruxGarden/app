import { create } from 'zustand';
import {
  SETUP_STEPS,
  type AiSection,
  type SetupMode,
  type SetupNeed,
  type SetupStepId,
} from './setup-plan';

/**
 * The Setup wizard's choices, kept apart from any screen so Back, Later and a
 * cancelled step never lose one. Nothing here is persisted: the choices are
 * applied when the person finishes or skips (setup-finish), through the same
 * services the Gateway always used.
 */
export interface SetupChoices {
  mode: SetupMode;
  step: SetupStepId;
  need: SetupNeed | null;
  advancedMode: boolean;
  /** The saved installation preference when the wizard opened. */
  advancedModeAtStart: boolean;
  gardenName: string;
  username: string;
  /** A photo waiting to be stored with the author when setup finishes. */
  photo: File | null;
  /** The "No AI" switch. */
  noAi: boolean;
  /** The AI Tools setting when the wizard opened ('true' | 'false' | null = never chosen). */
  aiAtStart: string | null;
  /** Something in step 3 was actually set up (a key, a sign-in, a model, an agent). */
  aiUsed: boolean;
  openSection: AiSection | null;
  /** Step 3 has opened its first section once; Later is respected after that. */
  aiSeeded: boolean;
  /** The Mood chosen in step 4; null keeps the one worn when the wizard opened. */
  moodId: string | null;
  /** Worn when the wizard opened, for Keep and cancel. */
  moodAtStart: string | null;
  cruxTitle: string;
  /** The person typed the name; the suggestion stops naming it. */
  cruxTitleEdited: boolean;
  /** Again: the person asked to start a Crux as well. */
  wantsCrux: boolean;
  /** Came from the summary's Edit: Continue goes straight back to it. */
  returnToSummary: boolean;
  /** Step 3's quiet disclosures. */
  moreOpen: boolean;
  developersOpen: boolean;
  /** The garden has been planted: the closing moment is playing. */
  planted: boolean;
}

export interface SetupStart {
  mode: SetupMode;
  advancedMode?: boolean;
  need?: SetupNeed | null;
  gardenName?: string;
  username?: string;
  aiAtStart: string | null;
  moodAtStart: string | null;
}

interface SetupActions {
  /** Begin (or resume, when the same mode is already under way) a run of the wizard. */
  begin: (start: SetupStart) => void;
  /** Forget everything; the next begin starts fresh. */
  reset: () => void;
  set: (patch: Partial<SetupChoices>) => void;
  next: () => void;
  back: () => void;
  goTo: (step: SetupStepId) => void;
}

export type SetupState = SetupChoices & SetupActions & { active: boolean };

export function initialChoices(start: SetupStart): SetupChoices {
  return {
    mode: start.mode,
    step: 'need',
    need: start.need ?? null,
    advancedMode: start.advancedMode ?? false,
    advancedModeAtStart: start.advancedMode ?? false,
    gardenName: start.gardenName ?? '',
    username: start.username ?? '',
    photo: null,
    noAi: start.aiAtStart === 'false',
    aiAtStart: start.aiAtStart,
    aiUsed: false,
    openSection: null,
    aiSeeded: false,
    moodId: null,
    moodAtStart: start.moodAtStart,
    cruxTitle: '',
    cruxTitleEdited: false,
    wantsCrux: false,
    returnToSummary: false,
    moreOpen: false,
    developersOpen: false,
    planted: false,
  };
}

/** The step after this one, or null at the end. */
export function nextStep(state: Pick<SetupChoices, 'step'>): SetupStepId | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(state.step) + 1] ?? null;
}

/** The step before this one, or null at the beginning. */
export function previousStep(state: Pick<SetupChoices, 'step'>): SetupStepId | null {
  const index = SETUP_STEPS.indexOf(state.step);
  return index > 0 ? SETUP_STEPS[index - 1]! : null;
}

/** How far the garden has grown: one stage per step behind the person. */
export function growthStage(state: Pick<SetupChoices, 'step' | 'planted'>): number {
  return state.planted ? SETUP_STEPS.length : SETUP_STEPS.indexOf(state.step);
}

export const useSetupWizard = create<SetupState>((set, get) => ({
  ...initialChoices({ mode: 'first', aiAtStart: null, moodAtStart: null }),
  active: false,
  begin: (start) => {
    const current = get();
    if (current.active && current.mode === start.mode) return;
    set({ ...initialChoices(start), active: true });
  },
  reset: () =>
    set({
      ...initialChoices({ mode: 'first', aiAtStart: null, moodAtStart: null }),
      active: false,
    }),
  set: (patch) => set(patch),
  next: () => {
    const state = get();
    if (state.returnToSummary) return set({ step: 'crux', returnToSummary: false });
    const step = nextStep(state);
    if (step) set({ step });
  },
  back: () => {
    const step = previousStep(get());
    if (step) set({ step, returnToSummary: false });
  },
  goTo: (step) => set({ step, returnToSummary: get().step === 'crux' && step !== 'crux' }),
}));

/** Settings → Garden and Help: run setup again, over whatever is on screen. */
export const useSetupAgain = create<{ open: boolean }>(() => ({ open: false }));

export function openSetupAgain(): void {
  useSetupAgain.setState({ open: true });
}

export function closeSetupAgain(): void {
  useSetupAgain.setState({ open: false });
}
