/**
 * Set pieces (ADR 0041): timeline-driven sequences — the Mood intro, the
 * Growth graph reveal — played by GSAP from the same tokens every role
 * reads. Never on buttons, panes or dialogs (Motion and CSS own those): one
 * system per element. A set piece plays at intensity normal and expressive
 * only; subtle keeps enters and exits alone, off is instant.
 */
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { readMotionTokens, type MotionTokens } from './motion-variants';

gsap.registerPlugin(CustomEase);

/** Whether a set piece may play now. */
export function setPieceAllowed(root: HTMLElement = document.documentElement): boolean {
  const level = root.dataset.motionIntensity ?? 'normal';
  if (level === 'off' || level === 'subtle') return false;
  const scale = parseFloat(getComputedStyle(root).getPropertyValue('--motion-scale')) || 0;
  return scale > 0;
}

const eases = new Map<string, string>();

/**
 * The Mood's curve as a GSAP ease: a cubic-bezier token becomes a CustomEase
 * (registered once per curve), frames become a stepped ease, expressive
 * overshoots. Falls back to power2.out.
 */
export function gsapEaseFor(
  tokens: Pick<MotionTokens, 'easeEnter' | 'frames' | 'intensity'>,
): string {
  if (tokens.frames > 0) return `steps(${tokens.frames})`;
  if (tokens.intensity === 'expressive') return 'back.out(1.4)';
  const m = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(
    tokens.easeEnter.trim(),
  );
  if (!m) return 'power2.out';
  const curve = m.slice(1, 5).map((n) => Number(n));
  if (curve.some((n) => !Number.isFinite(n))) return 'power2.out';
  const key = curve.join(',');
  let id = eases.get(key);
  if (!id) {
    id = `mood-${eases.size}`;
    CustomEase.create(id, key);
    eases.set(key, id);
  }
  return id;
}

/** A timeline whose defaults come from the tokens (base duration, the Mood's curve). */
export function moodTimeline(
  opts: gsap.TimelineVars = {},
  root: HTMLElement = document.documentElement,
): { timeline: gsap.core.Timeline; tokens: MotionTokens } {
  const tokens = readMotionTokens(root);
  const timeline = gsap.timeline({
    defaults: { duration: tokens.base / 1000, ease: gsapEaseFor(tokens) },
    ...opts,
  });
  return { timeline, tokens };
}

/**
 * The Growth graph reveal: node `i` of `n` at progress `t` (0..1). Nodes
 * appear in time order, each fading in over a third of the run, so early
 * checkpoints are settled while late ones still arrive.
 */
export function revealAlpha(t: number, i: number, n: number): number {
  if (t >= 1 || n <= 0) return 1;
  if (t <= 0) return 0;
  const window = 1 / 3;
  const start = (i / n) * (1 - window);
  return Math.min(1, Math.max(0, (t - start) / window));
}
