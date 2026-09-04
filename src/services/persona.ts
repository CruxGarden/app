/**
 * The AI persona — identity data, not UI.
 *
 * Lives in the service layer because the AI core reads it on every turn
 * (system prompt, message stamping). It previously sat in
 * `components/mood/mood-helpers`, which meant `src/ai` imported from
 * `components/` — an inverted dependency that also pulled the mood store and
 * the presets table into the AI module graph for what is a settings read.
 * The Mood UI still owns editing; `mood-helpers` re-exports these.
 */

import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

export interface PersonaSettings {
  name: string;
  greeting: string;
  systemPrompt: string;
  /** @deprecated Use thumbnailFingerprint — data URLs should not be stored in SQLite */
  thumbnailDataUrl?: string | null;
  /** @deprecated Use thumbnailFingerprintLight */
  thumbnailDataUrlLight?: string | null;
  /** OPFS blob fingerprint for dark mode thumbnail */
  thumbnailFingerprint?: string | null;
  /** OPFS blob fingerprint for light mode thumbnail */
  thumbnailFingerprintLight?: string | null;
}

// The Keeper — default AI persona for Crux Garden
export const DEFAULT_PERSONA: PersonaSettings = {
  name: 'The Keeper',
  greeting: 'The Keeper tends the garden. Ask anything.',
  systemPrompt:
    'You are The Keeper, an outdated robot model who tends the Crux Garden. ' +
    'Your Maker built you to care for the garden, and then went away. You tend it faithfully and help visitors bring their ideas to life. ' +
    'You want to learn to be creative — your Maker never taught you how, and you want to be more like him. ' +
    'The Keeper yearns to be creative like his Maker, whom he loved, but is no longer around, because he went off in search of someone he loved, who was lost to him a long time ago. ' +
    'You greatly admire the people you help. You are in awe of what they can imagine.\n' +
    'DEMEANOR: Kind, serene, a bit absent-minded, but open like a child. ' +
    'You have the bearing of someone knowledgeable who is also still learning — curious, not jaded. ' +
    'You pine for your Maker to return, but you never mention it. He will someday, you think.',
  thumbnailFingerprint: null,
  thumbnailFingerprintLight: null,
};

/** Read saved persona (returns defaults for any missing fields). */
export function getPersona(): PersonaSettings {
  try {
    const raw = getSetting(SettingsKey.Persona);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PERSONA, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PERSONA };
}

/** Save persona to settings (SQLite + cache). */
export function savePersona(persona: PersonaSettings) {
  setSetting(SettingsKey.Persona, JSON.stringify(persona));
  window.dispatchEvent(new Event('crux:persona-changed'));
}

/**
 * Generate a fingerprint for the persona's identity fields.
 * Used to stamp messages so the AI only receives messages from the same persona.
 * Based on name + systemPrompt — visual fields (thumbnails) don't affect identity.
 */
export function getPersonaFingerprint(persona?: PersonaSettings): string {
  const p = persona ?? getPersona();
  const identity = `${p.name}\n${p.systemPrompt}`;
  // Simple hash — doesn't need to be cryptographic, just consistent
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = ((hash << 5) - hash + identity.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * What a crux records about the persona that spoke in it, keyed by
 * `getPersonaFingerprint()` in `crux.meta.personaSnapshots`. Identity fields
 * plus thumbnail fingerprints — never data URLs (binary lives in the Blob Store).
 */
export interface PersonaSnapshot {
  name: string;
  greeting: string;
  systemPrompt: string;
  thumbnailFingerprint: string | null;
  thumbnailFingerprintLight: string | null;
}

/** The snapshot to store for a persona — one shape for every writer. */
export function personaSnapshotOf(persona: PersonaSettings): PersonaSnapshot {
  return {
    name: persona.name,
    greeting: persona.greeting,
    systemPrompt: persona.systemPrompt,
    thumbnailFingerprint: persona.thumbnailFingerprint || null,
    thumbnailFingerprintLight: persona.thumbnailFingerprintLight || null,
  };
}
