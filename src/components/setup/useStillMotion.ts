import { useEffect, useState } from 'react';

/** Motion off — chosen, or prefers-reduced-motion under "System" (ADR 0041). */
export function useStillMotion(): boolean {
  const read = () =>
    typeof document !== 'undefined' && document.documentElement.dataset.motionIntensity === 'off';
  const [still, setStill] = useState(read);
  useEffect(() => {
    const update = () => setStill(read());
    document.addEventListener('palette-change', update);
    const query =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    query?.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion-intensity'],
    });
    return () => {
      document.removeEventListener('palette-change', update);
      query?.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return still;
}
