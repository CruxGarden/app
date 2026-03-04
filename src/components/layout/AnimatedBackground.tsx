import { useEffect, useState } from 'react';
import BloomBackground from './BloomBackground';
import StarfieldBackground from './StarfieldBackground';
import FlowFieldBackground from './FlowFieldBackground';
import DriftBackground from './DriftBackground';

/**
 * Switches between BloomBackground and StarfieldBackground
 * based on the --background-type CSS variable (set via the palette system).
 */
const BG_STORAGE_KEY = 'cruxgarden:backgroundType';

function pickRandomDefault(): string {
  const choice = Math.random() < 0.5 ? 'bloom' : 'flowfield';
  localStorage.setItem(BG_STORAGE_KEY, choice);
  document.documentElement.style.setProperty('--background-type', choice);
  return choice;
}

export default function AnimatedBackground() {
  const [bgType, setBgType] = useState<string>(() => {
    // Prefer localStorage, then assign a random default
    const saved = localStorage.getItem(BG_STORAGE_KEY);
    if (saved) {
      document.documentElement.style.setProperty('--background-type', saved);
      return saved;
    }
    return pickRandomDefault();
  });

  useEffect(() => {
    // Watch for inline style changes on <html> (palette applies via style.setProperty)
    const observer = new MutationObserver(() => {
      const inline = document.documentElement.style.getPropertyValue('--background-type').trim();
      const saved = localStorage.getItem(BG_STORAGE_KEY);

      // If inline was cleared (e.g. resetPalette) but user has a saved preference, re-apply it
      if (!inline && saved) {
        document.documentElement.style.setProperty('--background-type', saved);
        setBgType(saved);
        return;
      }

      const val =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--background-type')
          .trim() || localStorage.getItem(BG_STORAGE_KEY) || 'bloom';
      setBgType((prev) => (prev !== val ? val : prev));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => observer.disconnect();
  }, []);

  if (bgType === 'starfield') return <StarfieldBackground />;
  if (bgType === 'flowfield') return <FlowFieldBackground />;
  if (bgType === 'drift') return <DriftBackground />;
  return <BloomBackground />;
}
