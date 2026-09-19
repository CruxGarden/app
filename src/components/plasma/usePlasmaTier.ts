import { useEffect, useState } from 'react';
import { readTier, type PlasmaTier } from './tiers';

/**
 * The Plasma quality tier. Reads <html data-plasma-tier> — the same place
 * usePlasmaOn reads the surface style from — and re-reads on palette-change,
 * so a Mood or a settings control can move it without a reload.
 */
export function usePlasmaTier(): PlasmaTier {
  const [tier, setTier] = useState(readTier);
  useEffect(() => {
    const update = () => setTier(readTier());
    update();
    document.addEventListener('palette-change', update);
    // A settings control writes the attribute directly; watch for that too.
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-plasma-tier'],
    });
    return () => {
      document.removeEventListener('palette-change', update);
      obs.disconnect();
    };
  }, []);
  return tier;
}
