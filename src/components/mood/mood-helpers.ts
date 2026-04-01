import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { applyMoodPalette } from '@/lib/moods';
import { MOOD_PRESETS } from '@/lib/moods/presets';
import { useMoodStore } from '@/stores/moodStore';

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
  } catch { /* ignore */ }
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

/** Get the current resolved mode (dark or light) */
export function getResolvedMode(): 'Dark' | 'Light' {
  return document.documentElement.classList.contains('light') ? 'Light' : 'Dark';
}

/** Get the settings key for the current mode */
function getMoodKey(): string {
  return getResolvedMode() === 'Light' ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark;
}

/** Get the active preset ID for the current mode */
export function getActiveMoodId(): string {
  const key = getMoodKey();
  return (getSetting(key) as string) || (getResolvedMode() === 'Light' ? 'ivory' : 'obsidian');
}

/**
 * Apply saved mood preset for the current mode.
 * Restores palette, background image, and cleans up legacy keys.
 */
export function applySavedMoodSettings() {
  // Clean up legacy keys from old mood system
  try {
    setSetting(SettingsKey.LegacyMoodPreset, '');
    setSetting(SettingsKey.LegacyMoodOverrides, '');
  } catch { /* ignore if settings not ready */ }

  const id = getActiveMoodId();
  const preset = MOOD_PRESETS.find((p) => p.id === id);
  if (preset) applyMoodPalette(preset.overrides);

  // Restore background image from OPFS if saved
  const savedBgType = getSetting(SettingsKey.BackgroundType) as string | null;
  if (savedBgType === 'image') {
    const savedFingerprint = getSetting(SettingsKey.BackgroundImage) as string | null;
    if (savedFingerprint) {
      // Async resolution — background loads after initial paint
      import('@/services/sqlite/client').then(({ getSqliteClient }) => {
        const db = getSqliteClient();
        db.blobRead(savedFingerprint).then((data) => {
          if (data) {
            const url = URL.createObjectURL(new Blob([data as unknown as BlobPart]));
            useMoodStore.setState({ backgroundUrl: url });
          }
        });
      }).catch(() => {});
    }
  }
}
