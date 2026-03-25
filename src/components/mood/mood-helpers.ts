import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { applyMoodPalette } from '@/lib/moods';
import { MOOD_PRESETS } from '@/lib/moods/presets';
import { useMoodStore } from '@/stores/moodStore';

export interface PersonaSettings {
  name: string;
  greeting: string;
  systemPrompt: string;
  thumbnailDataUrl: string | null;
}

export const DEFAULT_PERSONA: PersonaSettings = {
  name: '',
  greeting: '',
  systemPrompt: '',
  thumbnailDataUrl: null,
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
  return (getSetting(key) as string) || (getResolvedMode() === 'Light' ? 'parchment' : 'garden');
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

  // Restore background image URL if saved (synchronous — no flash)
  const savedBgType = getSetting(SettingsKey.BackgroundType) as string | null;
  if (savedBgType === 'image') {
    const savedImage = getSetting(SettingsKey.BackgroundImage) as string | null;
    if (savedImage) {
      useMoodStore.setState({ backgroundUrl: savedImage });
    }
  }
}
