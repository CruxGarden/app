import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  CONTRAST_PAIRS,
  READABLE,
  composite,
  contrastRatio,
  parseCssColor,
  type Rgba,
} from '@/lib/moods/contrast';

interface Reading {
  label: string;
  ratio: number;
}

/** Resolve a token to the colour the browser paints, through a probe element. */
function resolve(token: string, property: 'color' | 'background-color'): Rgba | null {
  const probe = document.createElement('div');
  probe.style.setProperty(property, `var(${token})`);
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return parseCssColor(value);
}

function measure(): Reading[] {
  const page = resolve('--bg', 'background-color');
  const ground: Rgba = page ? composite(page, [0, 0, 0, 1]) : [0, 0, 0, 1];
  const readings: Reading[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const text = resolve(pair.text, 'color');
    const surface = resolve(pair.surface, 'background-color');
    if (!text || !surface) continue;
    const under = composite(surface, ground);
    readings.push({ label: pair.label, ratio: contrastRatio(composite(text, under), under) });
  }
  return readings;
}

/**
 * The Mood's legibility, measured on the colours actually painted: one quiet
 * line while everything reads, a warning naming what does not.
 */
export default function ContrastCheck({ watch }: { watch?: unknown }) {
  const [readings, setReadings] = useState<Reading[]>([]);
  useEffect(() => {
    // After the palette has landed on <html>: next frame, and on every change.
    let frame = requestAnimationFrame(() => setReadings(measure()));
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setReadings(measure()));
    };
    document.addEventListener('palette-change', again);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('palette-change', again);
    };
  }, [watch]);
  if (!readings.length) return null;
  const hard = readings.filter((r) => r.ratio < READABLE);
  const lowest = Math.min(...readings.map((r) => r.ratio));
  return (
    <div
      role={hard.length ? 'alert' : 'status'}
      data-testid="contrast-check"
      className={cn(
        'text-xxs rounded-[var(--radius-sm)] px-2.5 py-1.5',
        hard.length
          ? 'border border-warning-border bg-warning-bg text-warning-text'
          : 'text-text-muted',
      )}
    >
      {hard.length ? (
        <>
          Hard to read:{' '}
          {hard.map((r, i) => (
            <span key={r.label}>
              {i > 0 && ' · '}
              {r.label.toLowerCase()} {r.ratio.toFixed(1)}:1
            </span>
          ))}{' '}
          (needs {READABLE}:1)
        </>
      ) : (
        <>Every text colour reads clearly (lowest {lowest.toFixed(1)}:1)</>
      )}
    </div>
  );
}
