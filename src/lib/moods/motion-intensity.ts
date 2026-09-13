/**
 * Motion intensity — the person's one knob for how animated the app is
 * (MOTION-PLAN.md, ADR 0041). A garden-wide setting, not a Mood token:
 *
 *   off        everything instant (the intensity scale is 0)
 *   subtle     enters and exits only; attention and ambient loops are off
 *   normal     the Mood as designed
 *   expressive the Mood's springs may overshoot: enters use the spring curve
 *
 * `system` (the default) follows the Mood's own default (`motionIntensity`
 * token, `normal` unless the Mood says `subtle` or `expressive`) and maps
 * `prefers-reduced-motion` to `off`. A person's explicit choice overrides
 * both. The resolved level lands on <html data-motion-intensity> and as
 * `--motion-intensity-scale`, which motion.css multiplies into every duration
 * beside the Mood's own motionScale.
 */
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting } from '@/services/settings';

export const MOTION_INTENSITIES = ['off', 'subtle', 'normal', 'expressive'] as const;
export type MotionIntensity = (typeof MOTION_INTENSITIES)[number];
export type MotionIntensitySetting = MotionIntensity | 'system';

export const MOTION_INTENSITY_SCALE: Record<MotionIntensity, number> = {
  off: 0,
  subtle: 0.7,
  normal: 1,
  expressive: 1.2,
};

export const MOTION_INTENSITY_LABELS: Record<MotionIntensitySetting, string> = {
  system: 'System',
  off: 'Off',
  subtle: 'Subtle',
  normal: 'Normal',
  expressive: 'Expressive',
};

export function isMotionIntensity(value: unknown): value is MotionIntensity {
  return (MOTION_INTENSITIES as readonly unknown[]).includes(value);
}

/**
 * The level to run at: the person's explicit choice; else `off` when the
 * system asks for reduced motion; else the Mood's default (never `off`);
 * else `normal`.
 */
export function resolveMotionIntensity(
  setting: string | null | undefined,
  moodDefault: string | null | undefined,
  reducedMotion: boolean,
): MotionIntensity {
  if (isMotionIntensity(setting)) return setting;
  if (reducedMotion) return 'off';
  if (isMotionIntensity(moodDefault) && moodDefault !== 'off') return moodDefault;
  return 'normal';
}

/** The person's setting (`system` when they have not chosen). */
export function motionIntensitySetting(): MotionIntensitySetting {
  const raw = getSetting(SettingsKey.MotionIntensity);
  return isMotionIntensity(raw) ? raw : 'system';
}

export function setMotionIntensitySetting(value: MotionIntensitySetting): void {
  setSetting(SettingsKey.MotionIntensity, value);
  applyMotionIntensity();
  // Motion-driven roles (hooks/useMotionRole) read their tokens again
  document.dispatchEvent(new Event('palette-change'));
}

function reducedMotionQuery(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
}

/**
 * Resolve and apply the level to <html>. Called after a Mood's tokens land
 * (applyMoodPalette), when the setting changes, and when the system
 * preference changes.
 */
export function applyMotionIntensity(
  root: HTMLElement = document.documentElement,
): MotionIntensity {
  const moodDefault =
    root.style.getPropertyValue('--motion-intensity').trim() ||
    (typeof getComputedStyle === 'function'
      ? getComputedStyle(root).getPropertyValue('--motion-intensity').trim()
      : '');
  const level = resolveMotionIntensity(
    motionIntensitySetting(),
    moodDefault,
    reducedMotionQuery()?.matches ?? false,
  );
  root.dataset.motionIntensity = level;
  root.style.setProperty('--motion-intensity-scale', String(MOTION_INTENSITY_SCALE[level]));
  return level;
}

let watching = false;
/** Follow the system preference while the app runs (idempotent). */
export function watchReducedMotion(): void {
  if (watching) return;
  const query = reducedMotionQuery();
  if (!query) return;
  watching = true;
  query.addEventListener('change', () => {
    applyMotionIntensity();
    document.dispatchEvent(new Event('palette-change'));
  });
}
