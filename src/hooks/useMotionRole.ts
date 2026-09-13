import { useEffect, useState } from 'react';
import { readMotionTokens, roleMotion, type RoleMotion } from '@/lib/motion-variants';
import type { EnterChoice, ExitChoice } from '@/lib/motion-variants';

/**
 * The Mood's motion for a role, for a motion element (ADR 0041):
 *
 *   const m = useMotionRole('dialog');
 *   <AnimatePresence>{open && <motion.div initial={m.initial} animate={m.animate} exit={m.exit} />}</AnimatePresence>
 *
 * Reads the tokens on <html> (choices, easings, durations × motionScale ×
 * intensity, springs, frames) and reads them again whenever a Mood or the
 * person's intensity changes (`palette-change`). Components name a role;
 * nothing here is hand-timed.
 */
export type MotionRole = 'dialog' | 'dropdown' | 'toast' | 'pane';

const ENTER_VAR: Record<MotionRole, string> = {
  dialog: '--motion-enter-dialog',
  dropdown: '--motion-enter-dropdown',
  toast: '--motion-enter-toast',
  pane: '--motion-enter-pane',
};
const EXIT_VAR: Partial<Record<MotionRole, string>> = {
  dialog: '--motion-exit-dialog',
  dropdown: '--motion-exit-dropdown',
  toast: '--motion-exit-toast',
};

export function readRoleMotion(role: MotionRole, root: HTMLElement = document.documentElement) {
  const tokens = readMotionTokens(root);
  const cs = getComputedStyle(root);
  const enter = (cs.getPropertyValue(ENTER_VAR[role]).trim() || 'none') as EnterChoice;
  const exitVar = EXIT_VAR[role];
  const exit = (exitVar ? cs.getPropertyValue(exitVar).trim() || 'none' : 'none') as ExitChoice;
  const enterMs = role === 'pane' ? tokens.slow : role === 'dialog' ? tokens.base : tokens.fast;
  return roleMotion(enter, exit, enterMs, tokens.fast, tokens);
}

export function useMotionRole(role: MotionRole): RoleMotion {
  const [motion, setMotion] = useState(() => readRoleMotion(role));
  useEffect(() => {
    const update = () => setMotion(readRoleMotion(role));
    update();
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, [role]);
  return motion;
}
