import { useRef, useState, useEffect } from 'react';

/** Returns a ref to attach to the pane container + whether the pane meets the minimum width. */
export function usePaneWidth(minWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [isTooNarrow, setIsTooNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setIsTooNarrow(entry.contentRect.width < minWidth);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);

  return { ref, isTooNarrow };
}
