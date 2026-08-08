import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { applyMoodPalette } from '@/lib/moods';
import { MOOD_PRESETS } from '@/lib/moods/presets';
import { useMoodStore } from '@/stores/moodStore';

// Persona identity lives in the service layer (services/persona) — the AI core
// reads it every turn and must not import from components/. Re-exported here so
// the Mood UI keeps its single import site.
export {
  DEFAULT_PERSONA,
  getPersona,
  savePersona,
  getPersonaFingerprint,
  type PersonaSettings,
} from '@/services/persona';

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
  } catch {
    /* ignore if settings not ready */
  }

  const id = getActiveMoodId();
  const preset = MOOD_PRESETS.find((p) => p.id === id);
  if (preset) applyMoodPalette(preset.overrides);

  // Restore background image from OPFS if saved
  const savedBgType = getSetting(SettingsKey.BackgroundType) as string | null;
  if (savedBgType === 'image') {
    const savedFingerprint = getSetting(SettingsKey.BackgroundImage) as string | null;
    if (savedFingerprint) {
      // Async resolution — background loads after initial paint
      import('@/services/sqlite/client')
        .then(({ getSqliteClient }) => {
          const db = getSqliteClient();
          db.blobRead(savedFingerprint).then((data) => {
            if (data) {
              const url = URL.createObjectURL(new Blob([data as unknown as BlobPart]));
              useMoodStore.setState({ backgroundUrl: url });
            }
          });
        })
        .catch(() => {});
    }
  }
}
