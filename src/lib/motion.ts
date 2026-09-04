/**
 * Motion roles — the JS half of styles/motion.css (ADR 0014).
 *
 * Components carry a role class (`motion-enter-dialog`, `motion-press`, …) and
 * the Mood's choice tokens decide what it does. Enters need nothing here: the
 * class animates on mount. Exits do: an element has to stay mounted while it
 * leaves, so `runExit` swaps the enter class for the exit class and resolves
 * when the animation ends — immediately when the Mood says `none` or when
 * motionScale (or prefers-reduced-motion) makes the duration 0.
 *
 * Pure helpers (parseCssTime, roleClass) have no DOM and are unit-tested.
 */

export const ENTER_ROLES = ['pane', 'dialog', 'dropdown', 'bubble', 'card', 'toast'] as const;
export const EXIT_ROLES = ['dialog', 'dropdown', 'toast'] as const;
export type EnterRole = (typeof ENTER_ROLES)[number];
export type ExitRole = (typeof EXIT_ROLES)[number];

/** The class a component puts on the element it wants to enter with `role`. */
export function enterClass(role: EnterRole): string {
  return `motion-enter-${role}`;
}
export function exitClass(role: ExitRole): string {
  return `motion-exit-${role}`;
}

/**
 * First value of a CSS <time> list ("0.25s", "150ms", "0.2s, 1s") in ms.
 * Non-time input (empty, "none") is 0.
 */
export function parseCssTime(value: string): number {
  const first = value.split(',')[0]?.trim() ?? '';
  const m = /^(-?\d*\.?\d+)(ms|s)$/.exec(first);
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  return m[2] === 's' ? n * 1000 : n;
}

/** How long the animation currently declared on `el` will run, in ms (0 = nothing to wait for). */
export function animationLength(el: HTMLElement): number {
  if (typeof getComputedStyle !== 'function') return 0;
  const cs = getComputedStyle(el);
  const name = cs.animationName.split(',')[0]?.trim();
  if (!name || name === 'none') return 0;
  const duration = parseCssTime(cs.animationDuration);
  if (duration <= 0) return 0;
  return duration + Math.max(0, parseCssTime(cs.animationDelay));
}

/**
 * Play the Mood's exit for `role` on `el`; resolves when it is over. Safe to
 * call on an element that never entered. A safety timer guarantees resolution
 * even if animationend never fires (display:none ancestors, tab in background).
 */
export function runExit(el: HTMLElement, role: ExitRole): Promise<void> {
  el.classList.remove(enterClass(role));
  el.classList.add(exitClass(role));
  const total = animationLength(el);
  if (total <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', onEnd);
      el.removeEventListener('animationcancel', onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el) finish();
    };
    el.addEventListener('animationend', onEnd);
    el.addEventListener('animationcancel', onEnd);
    const timer = setTimeout(finish, total + 60);
  });
}

/** Undo a pending exit (the thing re-opened mid-animation): back to the entered state. */
export function cancelExit(el: HTMLElement, role: ExitRole): void {
  el.classList.remove(exitClass(role));
  el.classList.add(enterClass(role));
}
