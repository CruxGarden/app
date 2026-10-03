import { useEffect, useState } from 'react';
import { colorWithAlpha, editableColor } from '@/lib/moods/color-controls';
import { readMotionTokens } from '@/lib/motion-variants';
import type { GraphAppearance } from './graph-style';
import './graph-appearance.css';

/** Canvas and Three need concrete sRGB, not unresolved CSS variables or color-mix(). */
export function readGraphAppearance(): GraphAppearance {
  const root = document.documentElement;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  root.appendChild(probe);
  const color = (variable: string) => {
    probe.style.color = `var(${variable})`;
    const css = getComputedStyle(probe).color;
    const parsed = editableColor(css);
    if (parsed) return colorWithAlpha(parsed.hex, parsed.alpha);
    // CSS also permits wide-gamut colors. Let the browser convert them to the
    // sRGB canvas used by both renderers instead of dropping their alpha.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${a! / 255})`;
  };
  try {
    probe.style.fontFamily = 'var(--font-body)';
    probe.style.fontWeight = 'var(--font-weight-body)';
    probe.style.letterSpacing = 'var(--letter-spacing-body)';
    probe.style.fontSize = 'var(--graph-label-size)';
    probe.style.borderWidth = 'var(--focus-ring-width)';
    probe.style.borderStyle = 'solid';
    const font = getComputedStyle(probe);
    const { base, slow } = readMotionTokens(root);
    return {
      background: color('--panel'),
      text: color('--text'),
      textMuted: color('--text-muted'),
      selected: color('--focus-ring'),
      selectionWidth: parseFloat(font.borderTopWidth),
      lanes: [
        color('--graph-lane1'),
        color('--graph-lane2'),
        color('--graph-lane3'),
        color('--graph-lane4'),
        color('--graph-lane5'),
        color('--graph-lane6'),
      ],
      link: color('--graph-link'),
      mergeLink: color('--graph-merge-link'),
      transferLink: color('--graph-transfer-link'),
      inactive: color('--graph-inactive'),
      fontFamily: font.fontFamily,
      fontWeight: font.fontWeight,
      letterSpacing: font.letterSpacing,
      labelSize: parseFloat(font.fontSize),
      motion: { base, slow },
    };
  } finally {
    probe.remove();
  }
}

/** One live palette for the canvas, legend and both graph renderers. */
export function useGraphAppearance(): GraphAppearance {
  const [appearance, setAppearance] = useState(readGraphAppearance);
  useEffect(() => {
    const update = () => setAppearance(readGraphAppearance());
    document.addEventListener('palette-change', update);
    document.fonts.addEventListener('loadingdone', update);
    return () => {
      document.removeEventListener('palette-change', update);
      document.fonts.removeEventListener('loadingdone', update);
    };
  }, []);
  return appearance;
}
