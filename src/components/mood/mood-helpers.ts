import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { applyActiveMood, activePresetId } from '@/lib/moods/active';
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

/** Get the active preset ID for the current mode */
export function getActiveMoodId(): string {
  return activePresetId(getResolvedMode());
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

  applyActiveMood(getResolvedMode());

  // Restore background image from OPFS if saved
  const savedBgType = getSetting(SettingsKey.BackgroundType) as string | null;
  if (savedBgType === 'image') {
    const savedFingerprint = getSetting(SettingsKey.BackgroundImage) as string | null;
    if (savedFingerprint) {
      // Async resolution — background loads after initial paint
      import('@/services/blobs')
        .then(({ blobObjectUrl }) => blobObjectUrl(savedFingerprint))
        .then((url) => useMoodStore.setState({ backgroundUrl: url }))
        .catch(() => {});
    }
  }
}
