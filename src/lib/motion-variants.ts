/**
 * Motion roles for the Motion library (ADR 0041) — the pure half of
 * hooks/useMotionRole. The Mood's tokens (choices, easings, durations,
 * springs, frames) and the person's intensity become Motion variants and a
 * transition; no component chooses timing. Mirrors what styles/motion.css does
 * for the roles that stay in CSS (bubbles, cards, panes, press, loops).
 */
import { steps } from 'motion';
import type { Transition, TargetAndTransition } from 'motion/react';
import { parseCssTime } from './motion';
import type { MotionIntensity } from './moods/motion-intensity';

export type EnterChoice = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale' | 'pop' | 'drift';
export type ExitChoice = 'none' | 'fade' | 'scale' | 'slide-down';

/** stiffness damping mass, as the `motionSpring*` tokens spell it. */
export interface Spring {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface MotionTokens {
  /** ms, already multiplied by the Mood's motionScale and the person's intensity */
  fast: number;
  base: number;
  slow: number;
  easeEnter: string;
  easeExit: string;
  springSnappy: Spring;
  springSoft: Spring;
  /** 0 = smooth, else stepped */
  frames: number;
  intensity: MotionIntensity;
}

export interface RoleMotion {
  initial: TargetAndTransition | false;
  animate: TargetAndTransition;
  exit: TargetAndTransition | undefined;
  transition: Transition;
  /** For tests and evidence: what the Mood chose */
  choice: { enter: EnterChoice; exit: ExitChoice };
}

export const DEFAULT_SPRING_SNAPPY: Spring = { stiffness: 500, damping: 35, mass: 1 };
export const DEFAULT_SPRING_SOFT: Spring = { stiffness: 170, damping: 24, mass: 1 };

/** "500 35 1" → a spring; anything malformed → the fallback. */
export function parseSpring(value: string, fallback: Spring): Spring {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return fallback;
  return {
    stiffness: parts[0]!,
    damping: parts[1]!,
    mass: parts[2] && parts[2] > 0 ? parts[2] : 1,
  };
}

/** "cubic-bezier(a, b, c, d)" → [a, b, c, d]; a named curve stays a name; otherwise ease-out. */
export function parseEase(value: string): Transition['ease'] {
  const v = value.trim();
  const m = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(v);
  if (m) {
    const nums = m.slice(1, 5).map(Number);
    if (nums.every((n) => Number.isFinite(n))) return nums as [number, number, number, number];
  }
  if (v === 'linear' || v === 'easeIn' || v === 'easeOut' || v === 'easeInOut') return v;
  if (v === 'ease-in') return 'easeIn';
  if (v === 'ease-out') return 'easeOut';
  if (v === 'ease-in-out') return 'easeInOut';
  return 'easeOut';
}

/** Where an enter starts (its `initial`); `animate` is always the rest state. */
export function enterFrom(choice: EnterChoice): TargetAndTransition | false {
  switch (choice) {
    case 'fade':
      return { opacity: 0 };
    case 'slide-up':
      return { opacity: 0, y: 10 };
    case 'slide-down':
      return { opacity: 0, y: -10 };
    case 'scale':
      return { opacity: 0, scale: 0.94 };
    case 'pop':
      return { opacity: 0, scale: 0.85 };
    case 'drift':
      return { opacity: 0, y: 14, scale: 0.985, filter: 'blur(3px)' };
    default:
      return false;
  }
}

/** Where an exit ends. */
export function exitTo(choice: ExitChoice): TargetAndTransition | undefined {
  switch (choice) {
    case 'fade':
      return { opacity: 0 };
    case 'scale':
      return { opacity: 0, scale: 0.94 };
    case 'slide-down':
      return { opacity: 0, y: 10 };
    default:
      return undefined;
  }
}

export const REST: TargetAndTransition = { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' };

/**
 * The transition for an enter: tween on the Mood's curve, stepped for pixel
 * Moods; a spring for `pop`, and for every enter when the person chose
 * expressive. Duration 0 (motionScale 0, intensity off) is instant.
 */
export function enterTransition(
  choice: EnterChoice,
  durationMs: number,
  tokens: MotionTokens,
): Transition {
  if (durationMs <= 0 || choice === 'none') return { duration: 0 };
  if (tokens.frames > 0)
    return { type: 'tween', duration: durationMs / 1000, ease: steps(tokens.frames, 'end') };
  if (choice === 'pop') return { type: 'spring', ...tokens.springSnappy };
  if (tokens.intensity === 'expressive') return { type: 'spring', ...tokens.springSoft };
  return { type: 'tween', duration: durationMs / 1000, ease: parseEase(tokens.easeEnter) };
}

export function exitTransition(
  choice: ExitChoice,
  durationMs: number,
  tokens: MotionTokens,
): Transition {
  if (durationMs <= 0 || choice === 'none') return { duration: 0 };
  if (tokens.frames > 0)
    return { type: 'tween', duration: durationMs / 1000, ease: steps(tokens.frames, 'end') };
  return { type: 'tween', duration: durationMs / 1000, ease: parseEase(tokens.easeExit) };
}

/** The Mood's motion for one role, ready for a motion element. */
export function roleMotion(
  enter: EnterChoice,
  exit: ExitChoice,
  enterMs: number,
  exitMs: number,
  tokens: MotionTokens,
): RoleMotion {
  const initial = enterFrom(enter);
  const leave = exitTo(exit);
  const exitT = exitTransition(exit, exitMs, tokens);
  return {
    initial,
    animate: { ...REST, transition: enterTransition(enter, enterMs, tokens) },
    exit: leave ? { ...leave, transition: exitT } : undefined,
    transition: enterTransition(enter, enterMs, tokens),
    choice: { enter, exit },
  };
}

/** Read the tokens Motion needs from the root element's computed style. */
export function readMotionTokens(root: HTMLElement): MotionTokens {
  const cs = getComputedStyle(root);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const scale = parseFloat(v('--motion-scale')) || 0;
  const intensityScale = parseFloat(v('--motion-intensity-scale'));
  const factor = scale * (Number.isFinite(intensityScale) ? intensityScale : 1);
  const ms = (name: string) => parseCssTime(v(name)) * factor;
  const intensity = (root.dataset.motionIntensity || 'normal') as MotionIntensity;
  return {
    fast: ms('--motion-duration-fast'),
    base: ms('--motion-duration-base'),
    slow: ms('--motion-duration-slow'),
    easeEnter: v('--motion-ease-enter'),
    easeExit: v('--motion-ease-exit'),
    springSnappy: parseSpring(cs.getPropertyValue('--motion-spring-snappy'), DEFAULT_SPRING_SNAPPY),
    springSoft: parseSpring(cs.getPropertyValue('--motion-spring-soft'), DEFAULT_SPRING_SOFT),
    frames: parseInt(v('--motion-frames'), 10) || 0,
    intensity,
  };
}
