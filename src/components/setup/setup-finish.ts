import type { SetupChoices } from './setup-store';

/**
 * Applying the wizard's choices. Everything goes through the services the
 * Gateway's setup always used (author, Garden title, the AI Tools setting,
 * the Mood); the dependencies are injected so the rules are tested without a
 * running app. Applying never removes anything: an empty field leaves what is
 * there, and running setup again only changes what the person changed.
 */
export interface SetupDeps {
  /** Plant the garden: the local author (idempotent). */
  ensureAuthor: () => Promise<unknown>;
  currentUsername: () => string | null | undefined;
  updateUsername: (username: string) => Promise<unknown>;
  uploadPhoto: (file: File) => Promise<unknown>;
  /** The Garden being set up (the root on a first run). */
  garden: () => { id: string; title?: string } | null;
  renameGarden: (id: string, title: string) => Promise<void>;
  /** The AI Tools setting as stored: 'true', 'false' or null (never chosen). */
  aiSetting: () => string | null;
  setAiEnabled: (on: boolean) => void;
  /** Wear a Mood for real (first run: as a new garden always did; again: the Garden's choice). */
  wearMood: (id: string) => Promise<void>;
  /** The Mood a new garden wears when none was chosen. */
  defaultMoodId: string;
  /** Remember what the person wants to make, so running setup again starts from it. */
  rememberNeed: (need: string) => void;
  setAdvancedMode: (on: boolean) => void;
}

export interface SetupOutcome {
  usernameChanged: boolean;
  gardenRenamed: boolean;
  /** true / false when the AI Tools setting was written, null when it was left alone. */
  ai: boolean | null;
  moodWorn: string | null;
}

/** What the AI Tools setting becomes: null leaves it as it is (the product default stays off). */
export function aiDecision(
  choices: Pick<SetupChoices, 'noAi' | 'aiUsed' | 'aiAtStart'>,
  current: string | null,
): boolean | null {
  if (choices.noAi) return current === 'false' ? null : false;
  // Turned the switch back off, or set something up: collaboration is wanted.
  const wanted = choices.aiUsed || choices.aiAtStart === 'false';
  if (wanted && current !== 'true') return true;
  return null;
}

export async function applySetup(choices: SetupChoices, deps: SetupDeps): Promise<SetupOutcome> {
  const outcome: SetupOutcome = {
    usernameChanged: false,
    gardenRenamed: false,
    ai: null,
    moodWorn: null,
  };
  await deps.ensureAuthor();

  const username = choices.username.trim();
  const current = deps.currentUsername();
  if (username && username !== current) {
    await deps.updateUsername(username);
    outcome.usernameChanged = true;
  }
  if (choices.photo) await deps.uploadPhoto(choices.photo);

  const garden = deps.garden();
  const name = choices.gardenName.trim();
  if (garden && name && name !== (garden.title ?? '')) {
    await deps.renameGarden(garden.id, name);
    outcome.gardenRenamed = true;
  }

  const ai = aiDecision(choices, deps.aiSetting());
  if (ai !== null) {
    deps.setAiEnabled(ai);
    outcome.ai = ai;
  }

  // A new garden always wore a Mood on planting; running setup again only
  // changes the Mood when a different one was chosen.
  const mood =
    choices.moodId && choices.moodId !== choices.moodAtStart
      ? choices.moodId
      : choices.mode === 'first'
        ? (choices.moodId ?? deps.defaultMoodId)
        : null;
  if (mood) {
    try {
      await deps.wearMood(mood);
      outcome.moodWorn = mood;
    } catch {
      // The garden still opens; the Mood can be worn from the Mood pane.
    }
  }

  if (choices.need) deps.rememberNeed(choices.need);
  if (choices.advancedMode !== choices.advancedModeAtStart) {
    deps.setAdvancedMode(choices.advancedMode);
  }
  return outcome;
}
