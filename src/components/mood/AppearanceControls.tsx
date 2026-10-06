import { CUSTOMIZER_GROUPS, CUSTOMIZER_KEYS, resetCustomizer } from '@/lib/moods/customizer';
import { editableColor, colorWithAlpha } from '@/lib/moods/color-controls';
import { setSurfaceTheme } from '@/lib/moods/surface-theme';
import { fieldClass } from '@/components/ui/field-class';
import { useEffect, useId, useState } from 'react';
import {
  applyActiveMood,
  getThemeOverrides,
  resolvedSection,
  setThemeOverrides,
} from '@/lib/moods/active';

function readAppearance() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    probe.hidden = true;
    document.body.append(probe);
    const resolved = editableColor(getComputedStyle(probe).color);
    probe.remove();
    return resolved ?? { hex: fallback, alpha: 1 };
  };
  return {
    scale: Math.round((parseFloat(style.getPropertyValue('--font-scale')) || 1) * 100),
    accent: color('--accent', '#6b8e76'),
    background: color('--bg', '#18251f'),
    customized: [...CUSTOMIZER_KEYS].some((key) => key in getThemeOverrides()),
    choices: Object.fromEntries(
      CUSTOMIZER_GROUPS.map((group) => [
        group.id,
        group.choices.findIndex((choice) =>
          Object.entries(choice.tokens).every(
            ([key, value]) =>
              style
                .getPropertyValue(`--${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`)
                .trim() === value,
          ),
        ),
      ]),
    ),
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
    if ('surfaceStyle' in tokens) setSurfaceTheme('custom');
    applyActiveMood(section);
    setAppearance(readAppearance());
  };
  const reset = () => {
    const section = resolvedSection();
    setThemeOverrides(section, resetCustomizer(getThemeOverrides(section)));
    applyActiveMood(section);
    setAppearance(readAppearance());
  };
  return (
    <section aria-label="Appearance" className="flex flex-col gap-4 pb-4 border-b border-border">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm text-text">Quick controls</h3>
        <button
          type="button"
          onClick={reset}
          disabled={!appearance.customized}
          className="text-xs text-text-muted hover:text-text cursor-pointer disabled:cursor-default"
        >
          Reset quick controls
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
            value={appearance.accent.hex}
            onChange={(e) =>
              change({ accent: colorWithAlpha(e.target.value, appearance.accent.alpha) })
            }
            className="h-8 w-10 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
        </label>
        <label className="flex items-center gap-3 text-xs text-text">
          Background color
          <input
            type="color"
            value={appearance.background.hex}
            onChange={(e) =>
              change({
                bg: colorWithAlpha(e.target.value, appearance.background.alpha),
                plasmaBackground: colorWithAlpha(e.target.value, appearance.background.alpha),
              })
            }
            className="h-8 w-10 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {CUSTOMIZER_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor={`${id}-${group.id}`} className="text-xs text-text">
                {group.label}
              </label>
              <p id={`${id}-${group.id}-hint`} className="text-xs text-text-muted">
                {group.hint}
              </p>
            </div>
            <select
              id={`${id}-${group.id}`}
              aria-describedby={`${id}-${group.id}-hint`}
              value={appearance.choices[group.id]}
              onChange={(e) => {
                const choice = group.choices[Number(e.target.value)];
                if (choice) change(choice.tokens);
              }}
              className={fieldClass(undefined, 'w-36', 'sm')}
            >
              <option value={-1} disabled>
                Current custom look
              </option>
              {group.choices.map((choice, index) => (
                <option key={choice.label} value={index}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        Reset only affects these quick controls. Use Moods → Save current as Mood to keep or share a
        named copy.
      </p>
    </section>
  );
}
