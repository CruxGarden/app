import { useEffect, useState } from 'react';
import MeshBackground from './MeshBackground';
import StarfieldBackground from './StarfieldBackground';

/**
 * Switches between MeshBackground and StarfieldBackground
 * based on the --background-type CSS variable (set via the palette system).
 */
const BG_STORAGE_KEY = 'cruxgarden:backgroundType';

export default function AnimatedBackground() {
  const [bgType, setBgType] = useState<string>(() => {
    // Prefer localStorage, then CSS variable, then default
    const saved = localStorage.getItem(BG_STORAGE_KEY);
    if (saved) {
      document.documentElement.style.setProperty('--background-type', saved);
      return saved;
    }
    return (
      getComputedStyle(document.documentElement)
        .getPropertyValue('--background-type')
        .trim() || 'mesh'
    );
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
          .trim() || 'mesh';
      setBgType((prev) => (prev !== val ? val : prev));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => observer.disconnect();
  }, []);

  if (bgType === 'starfield') return <StarfieldBackground />;
  return <MeshBackground />;
}
