import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { applyActiveMood } from '@/lib/moods/active';
import { setBackgroundType } from '@/services/background';
import { BgType } from '@/lib/types';

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

  // The background service owns loading order and the displayed URL's lifetime.
  if (getSetting(SettingsKey.BackgroundType) === BgType.Image) {
    void setBackgroundType(BgType.Image);
  }
}
