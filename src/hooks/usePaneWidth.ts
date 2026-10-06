import { useRef, useState, useEffect } from 'react';

/** Returns a ref to attach to the pane container + whether the pane meets the minimum width. */
export function usePaneWidth(minWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [isTooNarrow, setIsTooNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The pane's own width, padding included: the minimums describe the
    // column the person sees and drags, and a Mood's body padding (Plasma
    // opens it to 16px) must not turn a fair column into "Widen the pane".
    const pane = el.closest<HTMLElement>('.mosaic-window-body');
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setIsTooNarrow((pane?.clientWidth ?? entry.contentRect.width) < minWidth);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);

  return { ref, isTooNarrow };
}
