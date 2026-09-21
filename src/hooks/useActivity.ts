import { useEffect, useState } from 'react';
import { onActivity } from '@/lib/moods/signals';

/**
 * Where the activity signal stops being background and starts lighting things
 * up. Below this the garden only warms its colour (--life in motion.css); the
 * rim is the last stage, so a lit garden means a busy one, not a used one.
 */
export const LIT_FROM = 0.6;

/** 0 below `LIT_FROM`, ramping to 1 at full activity. */
export function litLevel(activity: number, from = LIT_FROM): number {
  if (from >= 1) return activity >= 1 ? 1 : 0;
  const t = (activity - from) / (1 - from);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** The live activity signal, 0..1, quantised — at most a few dozen renders per fade. */
export function useActivity(): number {
  const [level, setLevel] = useState(0);
  useEffect(() => onActivity(setLevel), []);
  return level;
}

/**
 * The lit level the material should use: the ramp, held at 0 when the person
 * has asked for no motion (ADR 0041) so the rim stays exactly where the Mood
 * put it. The CSS half of the reaction is guarded the same way in motion.css.
 */
export function useLitLevel(): number {
  const activity = useActivity();
  const [still, setStill] = useState(() => motionIsOff());
  useEffect(() => {
    const obs = new MutationObserver(() => setStill(motionIsOff()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion-intensity'],
    });
    return () => obs.disconnect();
  }, []);
  return still ? 0 : litLevel(activity);
}

function motionIsOff(): boolean {
  if (typeof document === 'undefined') return true;
  const set = document.documentElement.getAttribute('data-motion-intensity');
  if (set) return set === 'off';
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
