import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { bundledMood } from '@/lib/moods/bundled-moods';
import type { MoodPackage } from '@/lib/moods/packages';
import {
  HUES,
  materialChoice,
  moodIdFor,
  swatch,
  type Material,
  type Mode,
} from '@/lib/moods/material';
import {
  applyActiveMood,
  getThemeOverrides,
  setThemeOverrides,
  onThemeOverridesChange,
  resolvedSection,
} from '@/lib/moods/active';

/**
 * The Material Moods (Daniel, 2026-09-19: "you chose Plasma or Soft themes,
 * followed up by a hue, and light/dark … Plasma and Soft can have their own
 * much simpler controls specific to them"): three choices — the material,
 * the hue, the mode — wear the matching bundled Mood on the spot, and each
 * material has two plain switches. Everything deeper stays in the Mood
 * Builder, with the HyperMoods.
 */
/** The two plain switches each material offers, as token overrides on the worn Mood. */
const SWITCHES: Record<
  Material,
  {
    key: string;
    label: string;
    options: { id: string; label: string; tokens: Record<string, string> }[];
  }[]
> = {
  plasma: [
    {
      key: 'motion',
      label: 'Motion',
      options: [
        {
          id: 'still',
          label: 'Still',
          tokens: {
            plasmaFlow: '0',
            plasmaStretch: '1',
            plasmaAmbientDrops: 'off',
            plasmaPointerPull: 'off',
          },
        },
        {
          id: 'water',
          label: 'Water',
          tokens: {
            plasmaFlow: '2',
            plasmaStretch: '2.5',
            plasmaAmbientDrops: 'on',
            plasmaPointerPull: 'on',
          },
        },
      ],
    },
    {
      key: 'rim',
      label: 'Rim',
      options: [
        { id: 'hair', label: 'Hair', tokens: { plasmaRim: '0.35' } },
        { id: 'full', label: 'Full', tokens: { plasmaRim: '0.65' } },
      ],
    },
  ],
  soft: [
    {
      key: 'frost',
      label: 'Frost',
      options: [
        { id: 'light', label: 'Light', tokens: { plasmaFrost: '0.5', plasmaOpacity: '0.6' } },
        { id: 'deep', label: 'Deep', tokens: { plasmaFrost: '0.9', plasmaOpacity: '0.8' } },
      ],
    },
    {
      key: 'corners',
      label: 'Corners',
      options: [
        {
          id: 'soft',
          label: 'Soft',
          tokens: {
            radius: '10px',
            radiusSm: '8px',
            radiusLg: '12px',
            chipRadius: '8px',
            plasmaSmoothness: '1',
          },
        },
        {
          id: 'hard',
          label: 'Hard',
          tokens: {
            radius: '0px',
            radiusSm: '0px',
            radiusLg: '0px',
            chipRadius: '0px',
            plasmaSmoothness: '0',
          },
        },
      ],
    },
  ],
};

function Seg({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string | null;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <span className="text-xxs font-mono uppercase tracking-wider text-caption w-16">{label}</span>
      <div className="inline-flex rounded-[var(--radius-sm)] border border-border overflow-hidden">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'px-3 py-1 text-xs cursor-pointer transition-colors',
              value === o.id
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text hover:bg-action-button-hover',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MaterialMoods({
  wornId,
  busy,
  onWear,
}: {
  wornId: string | null;
  busy: boolean;
  onWear: (pkg: MoodPackage) => Promise<void>;
}) {
  const worn = materialChoice(wornId);
  // The last choices stand while a HyperMood is worn, so a click brings them back.
  const [material, setMaterial] = useState<Material>(worn?.material ?? 'plasma');
  const [hue, setHue] = useState(worn?.hue ?? 'neutral');
  const [mode, setMode] = useState<Mode>(worn?.mode ?? 'dark');
  useEffect(() => {
    if (worn) {
      setMaterial(worn.material);
      setHue(worn.hue);
      setMode(worn.mode);
    }
  }, [worn?.material, worn?.hue, worn?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // The switches read the worn Mood's overrides for its mode.
  const [tick, setTick] = useState(0);
  useEffect(() => onThemeOverridesChange(() => setTick((t) => t + 1)), []);
  const section = resolvedSection();
  const overrides = getThemeOverrides(section);
  void tick;
  const current = (sw: (typeof SWITCHES)[Material][number]) => {
    const preset = wornId ? bundledMood(wornId.replace(/^user-/, ''))?.theme.overrides : undefined;
    const value = (k: string) => overrides[k] ?? preset?.[k];
    return (
      sw.options.find((o) => Object.entries(o.tokens).every(([k, v]) => value(k) === v))?.id ?? null
    );
  };

  const wear = async (m: Material, h: string, md: Mode) => {
    setMaterial(m);
    setHue(h);
    setMode(md);
    const pkg = bundledMood(moodIdFor(m, h, md));
    if (pkg) await onWear(pkg);
  };
  const flip = (sw: (typeof SWITCHES)[Material][number], id: string) => {
    const opt = sw.options.find((o) => o.id === id);
    if (!opt) return;
    // The switch owns its tokens: clear every option's, set the chosen one's.
    const next: Record<string, string> = { ...overrides };
    for (const o of sw.options) for (const k of Object.keys(o.tokens)) delete next[k];
    setThemeOverrides(section, { ...next, ...opt.tokens });
    applyActiveMood(section);
  };

  return (
    <section className="flex flex-col gap-3" data-testid="material-moods">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xxs font-mono uppercase tracking-wider text-caption">Material</h3>
        <span className="text-2xs text-text-muted">
          A material, a hue, a mode — {worn ? 'wearing it now' : 'click to wear one'}.
        </span>
      </div>
      <Seg
        label="Material"
        value={worn ? material : null}
        options={[
          { id: 'plasma', label: 'Plasma' },
          { id: 'soft', label: 'Soft' },
        ]}
        onChange={(id) => void wear(id as Material, hue, mode)}
        testId="material-material"
      />
      <Seg
        label="Mode"
        value={worn ? mode : null}
        options={[
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' },
        ]}
        onChange={(id) => void wear(material, hue, id as Mode)}
        testId="material-mode"
      />
      <div className="flex items-center gap-2" data-testid="material-hue">
        <span className="text-xxs font-mono uppercase tracking-wider text-caption w-16">Hue</span>
        <div className="flex flex-wrap gap-2">
          {HUES.map((h) => {
            const sw = swatch(h.id, mode);
            const active = worn ? hue === h.id : false;
            return (
              <button
                key={h.id}
                type="button"
                aria-label={h.name}
                aria-pressed={active}
                title={h.name}
                disabled={busy}
                onClick={() => void wear(material, h.id, mode)}
                className={cn(
                  'w-8 h-8 rounded-full border-2 cursor-pointer transition-transform',
                  active ? 'border-accent scale-110' : 'border-border hover:border-text-muted',
                )}
                style={{
                  background: `linear-gradient(135deg, ${sw.bg} 50%, ${sw.accent} 50%)`,
                }}
              />
            );
          })}
        </div>
      </div>
      {worn && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1" data-testid="material-switches">
          {SWITCHES[material].map((sw) => (
            <Seg
              key={sw.key}
              label={sw.label}
              value={current(sw)}
              options={sw.options}
              onChange={(id) => flip(sw, id)}
              testId={`material-switch-${sw.key}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
