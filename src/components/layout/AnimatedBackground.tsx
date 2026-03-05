import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import BloomBackground from './BloomBackground';
import StarfieldBackground from './StarfieldBackground';
import FlowFieldBackground from './FlowFieldBackground';
import DriftBackground from './DriftBackground';

const BG_STORAGE_KEY = 'cruxgarden:backgroundType';

function pickRandomDefault(): string {
  const r = Math.random();
  const choice = r < 0.34 ? 'bloom' : r < 0.67 ? 'flowfield' : 'drift';
  localStorage.setItem(BG_STORAGE_KEY, choice);
  document.documentElement.style.setProperty('--background-type', choice);
  return choice;
}

export default function AnimatedBackground() {
  const resolved = useThemeStore((s) => s.resolved);

  const [bgType, setBgType] = useState<string>(() => {
    const saved = localStorage.getItem(BG_STORAGE_KEY);
    if (saved) {
      document.documentElement.style.setProperty('--background-type', saved);
      return saved;
    }
    return pickRandomDefault();
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const inline = document.documentElement.style.getPropertyValue('--background-type').trim();
      const saved = localStorage.getItem(BG_STORAGE_KEY);

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

  // Blank = solid background, no animation
  // Dark: just the existing --bg. Light: soft gray-green tinted from accent.
  if (bgType === 'blank') {
    if (resolved === 'light') {
      return (
        <div
          aria-hidden="true"
          className="fixed inset-0 w-full h-full"
          style={{
            zIndex: 0,
            pointerEvents: 'none',
            background: 'color-mix(in srgb, var(--accent) 15%, color-mix(in srgb, black 12%, var(--bg)))',
          }}
        />
      );
    }
    return null;
  }

  // Light mode: only bloom is available (flow/drift are dark-only)
  if (resolved === 'light') return <BloomBackground />;

  if (bgType === 'starfield') return <StarfieldBackground />;
  if (bgType === 'flowfield') return <FlowFieldBackground />;
  if (bgType === 'drift') return <DriftBackground />;
  return <BloomBackground />;
}
