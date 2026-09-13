import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';

/**
 * Navigation between screens (Home ↔ Crux, Crux ↔ Crux, Task ↔ Task) goes
 * through the View Transitions API (ADR 0041): React Router wraps the route
 * change in `document.startViewTransition` where the browser has it, and
 * styles/motion.css animates the old and new screens from the Mood's
 * pane-enter choice and durations (`html[data-motion-pane]`, set beside the
 * intensity). Intensity `off` makes it instant; a browser without the API
 * navigates as before.
 */
export function useMoodNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: To, options?: NavigateOptions) => navigate(to, { viewTransition: true, ...options }),
    [navigate],
  );
}

/** For `<Link>`s that change screens. */
export const MOOD_LINK = { viewTransition: true } as const;
