import { useEffect, useState } from 'react';
import { CHROME_ATTR } from './PlasmaStage';
import { usePlasmaOn } from './usePlasmaOn';

/**
 * Whether the chrome — the top bar, menus and dialogs — is flat translucent
 * plates rather than the material (the Mood's `plasmaChrome` token; Daniel,
 * 2026-09-19: "keep the plasma to the main garden"). False whenever Plasma
 * is off, when there is no material to be flat against.
 */
export function useFlatChrome(): boolean {
  const on = usePlasmaOn();
  const read = () => document.documentElement.getAttribute(CHROME_ATTR) === 'flat';
  const [flat, setFlat] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setFlat(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [CHROME_ATTR] });
    setFlat(read());
    return () => obs.disconnect();
  }, []);
  return on && flat;
}
