import { useEffect, useState } from 'react';

/**
 * Whether the Plasma theme is on. Reads the same <html data-surface-style>
 * the stylesheets key off, and re-reads on palette-change, which is what the
 * Mood pipeline and the theme switch both fire.
 */
export function usePlasmaOn(): boolean {
  const read = () => document.documentElement.dataset.surfaceStyle === 'plasma';
  const [on, setOn] = useState(read);
  useEffect(() => {
    const update = () => setOn(read());
    update();
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  return on;
}
