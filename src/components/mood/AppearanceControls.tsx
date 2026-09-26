import { useEffect, useId, useState } from 'react';
import {
  applyActiveMood,
  getThemeOverrides,
  resolvedSection,
  setThemeOverrides,
} from '@/lib/moods/active';

const BASIC_TOKENS = ['fontScale', 'accent', 'bg', 'plasmaBackground'];

function readAppearance() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    if (/^#[\da-f]{6}$/i.test(value)) return value;
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    probe.hidden = true;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    probe.remove();
    return rgb
      ? '#' +
          rgb
            .slice(1, 4)
            .map((n) => Number(n).toString(16).padStart(2, '0'))
            .join('')
      : fallback;
  };
  return {
    scale: Math.round((parseFloat(style.getPropertyValue('--font-scale')) || 1) * 100),
    accent: color('--accent', '#6b8e76'),
    background: color('--bg', '#18251f'),
    customized: BASIC_TOKENS.some((key) => key in getThemeOverrides()),
  };
}

/** Everyday appearance choices. The same Mood tokens are available to agents and the Theme tab. */
export default function AppearanceControls() {
  const [appearance, setAppearance] = useState(readAppearance);
  const id = useId();
  useEffect(() => {
    const update = () => setAppearance(readAppearance());
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  const change = (tokens: Record<string, string>) => {
    const section = resolvedSection();
    setThemeOverrides(section, { ...getThemeOverrides(section), ...tokens });
    applyActiveMood(section);
    setAppearance(readAppearance());
  };
  const reset = () => {
    const section = resolvedSection();
    setThemeOverrides(
      section,
      Object.fromEntries(
        Object.entries(getThemeOverrides(section)).filter(([key]) => !BASIC_TOKENS.includes(key)),
      ),
    );
    applyActiveMood(section);
    setAppearance(readAppearance());
  };
  return (
    <section aria-label="Appearance" className="flex flex-col gap-4 pb-4 border-b border-border">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm text-text">Appearance</h3>
        <button
          type="button"
          onClick={reset}
          disabled={!appearance.customized}
          className="text-xs text-text-muted hover:text-text disabled:opacity-40 cursor-pointer disabled:cursor-default"
        >
          Reset appearance
        </button>
      </div>
      <div>
        <div className="flex justify-between gap-3 text-xs text-text">
          <label htmlFor={`${id}-size`}>Text size</label>
          <output htmlFor={`${id}-size`}>{appearance.scale}%</output>
        </div>
        <input
          id={`${id}-size`}
          type="range"
          min="85"
          max="150"
          step="1"
          value={appearance.scale}
          aria-valuetext={`${appearance.scale} percent`}
          onChange={(e) => change({ fontScale: String(Number(e.target.value) / 100) })}
          className="w-full accent-accent cursor-pointer"
        />
        <p className="text-xs text-text-muted">Make the app more comfortable to read.</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <label className="flex items-center gap-3 text-xs text-text">
          Accent color
          <input
            type="color"
            value={appearance.accent}
            onChange={(e) => change({ accent: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
        </label>
        <label className="flex items-center gap-3 text-xs text-text">
          Background color
          <input
            type="color"
            value={appearance.background}
            onChange={(e) => change({ bg: e.target.value, plasmaBackground: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
        </label>
      </div>
    </section>
  );
}
