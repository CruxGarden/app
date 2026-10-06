import { useCallback, useEffect, useState, type SetStateAction } from 'react';

const compactQuery = '(max-width: 980px)';

/** Narrow notebooks use the same controls, with one drawer over the editor. */
export function useNotebookPanes() {
  const [panes, setPanes] = useState(() => {
    const compact = window.matchMedia?.(compactQuery).matches ?? false;
    return { compact, leftVisible: !compact, outlineVisible: !compact };
  });

  useEffect(() => {
    const media = window.matchMedia?.(compactQuery);
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => {
      setPanes((current) => ({
        ...current,
        compact: event.matches,
        ...(event.matches ? { leftVisible: false, outlineVisible: false } : {}),
      }));
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setLeftVisible = useCallback((value: SetStateAction<boolean>) => {
    setPanes((current) => {
      const leftVisible = typeof value === 'function' ? value(current.leftVisible) : value;
      return {
        ...current,
        leftVisible,
        outlineVisible: current.compact && leftVisible ? false : current.outlineVisible,
      };
    });
  }, []);
  const setOutlineVisible = useCallback((value: SetStateAction<boolean>) => {
    setPanes((current) => {
      const outlineVisible = typeof value === 'function' ? value(current.outlineVisible) : value;
      return {
        ...current,
        outlineVisible,
        leftVisible: current.compact && outlineVisible ? false : current.leftVisible,
      };
    });
  }, []);

  return { ...panes, setLeftVisible, setOutlineVisible };
}
