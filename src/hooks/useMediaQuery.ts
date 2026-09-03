import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query. Use it to render ONE layout branch instead
 * of rendering two and hiding one with CSS — hidden trees still mount, run
 * effects, subscribe to stores, and re-render on every store change.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tailwind's `md` breakpoint — the desktop/mobile split used by the workspace. */
export const useIsDesktopLayout = () => useMediaQuery('(min-width: 768px)');
