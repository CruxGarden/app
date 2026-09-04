import { useEffect, useRef, useState } from 'react';
import { cancelExit, enterClass, runExit, type ExitRole } from '@/lib/motion';

/**
 * Keep an element mounted while the Mood's exit animation plays.
 *
 *   const { ref, mounted, className } = useMotionExit(open, 'dialog');
 *   if (!mounted) return null;
 *   return <div ref={ref} className={cn(className, …)}>…</div>;
 *
 * `className` is the enter role class (`motion-enter-dialog`); on close the
 * hook swaps it for `motion-exit-dialog`, waits for animationend (or nothing,
 * when the Mood says none / motionScale is 0) and only then reports
 * `mounted: false`. Re-opening mid-exit cancels the exit.
 */
export function useMotionExit<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  role: ExitRole,
) {
  const ref = useRef<T | null>(null);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    const el = ref.current;
    if (open) {
      if (el) cancelExit(el, role);
      setMounted(true);
      return;
    }
    if (!el) {
      setMounted(false);
      return;
    }
    let cancelled = false;
    void runExit(el, role).then(() => {
      if (!cancelled) setMounted(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, role]);

  return { ref, mounted, className: enterClass(role) };
}
