import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  SURFACE_THEMES,
  SURFACE_THEME_LABELS,
  surfaceTheme,
  setSurfaceTheme,
  type SurfaceTheme,
} from '@/lib/moods/surface-theme';

/**
 * The surface theme (ADR 0043): Plasma and Glass are whole looks that take
 * over every primary surface; Custom leaves the Mood as designed, which is
 * where the Mood Builder's pane colours and glass tokens apply.
 */
export default function SurfaceThemeControl({ className }: { className?: string }) {
  const [value, setValue] = useState<SurfaceTheme>(() => surfaceTheme());
  return (
    <label className={cn('inline-flex items-center gap-1.5 text-xxs text-text-muted', className)}>
      <span>Surface</span>
      <select
        aria-label="Surface theme"
        value={value}
        onChange={(e) => {
          const next = e.target.value as SurfaceTheme;
          setValue(next);
          setSurfaceTheme(next);
        }}
        className={cn(
          'h-6 px-1.5 rounded-[var(--radius-sm)] text-xxs font-body',
          'bg-surface text-text border border-border hover:border-accent cursor-pointer',
        )}
      >
        {SURFACE_THEMES.map((v) => (
          <option key={v} value={v}>
            {SURFACE_THEME_LABELS[v]}
          </option>
        ))}
      </select>
    </label>
  );
}
