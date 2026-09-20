import { useEffect, useState } from 'react';
import { Input } from '@/components/ui';
import {
  applyActiveMood,
  getThemeOverrides,
  onThemeOverridesChange,
  setThemeOverrides,
} from '@/lib/moods/active';
import type { MoodSection } from '@/lib/moods/active';
import { DEFAULT_PANE_LABELS } from '@/lib/pane-labels';
import type { PaneType } from '@/stores/uiStore';

/**
 * Settings → Names: the garden's title and what its panes are called. Written
 * as theme overrides for both modes (a name is not a colour), so a Mood the
 * person wears later keeps them, and a Mood that sets its own names is a
 * metaphor the person can still overrule here.
 */
const SECTIONS: MoodSection[] = ['Dark', 'Light'];
const PANES = Object.keys(DEFAULT_PANE_LABELS) as PaneType[];
const tokenFor = (type: PaneType) => `paneLabel${type[0]!.toUpperCase()}${type.slice(1)}`;

export default function NamesSettings() {
  const [tick, setTick] = useState(0);
  useEffect(() => onThemeOverridesChange(() => setTick((t) => t + 1)), []);
  void tick;
  const current = getThemeOverrides('Dark');

  const write = (key: string, value: string) => {
    const v = value.trim();
    for (const section of SECTIONS) {
      const next = { ...getThemeOverrides(section) };
      if (v) next[key] = v;
      else delete next[key];
      setThemeOverrides(section, next);
    }
    applyActiveMood();
  };

  return (
    <section className="mb-8" data-testid="names-settings">
      <h2 className="font-display text-sm font-medium text-settings-label mb-1">Names</h2>
      <p className="text-xs text-text-muted mb-4">
        What this garden calls itself and its panes. Leave a field empty for the usual word.
      </p>
      <label className="flex flex-col gap-1 mb-4">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
          Garden title
        </span>
        <Input
          aria-label="Garden title"
          placeholder="The Bachelor Pad, Floyd County Police Department…"
          defaultValue={current.gardenTitle ?? ''}
          onBlur={(e) => write('gardenTitle', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {PANES.map((type) => (
          <label key={type} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs font-mono text-text-muted">
              {DEFAULT_PANE_LABELS[type]}
            </span>
            <Input
              aria-label={`Name for ${DEFAULT_PANE_LABELS[type]}`}
              placeholder={DEFAULT_PANE_LABELS[type]}
              defaultValue={current[tokenFor(type)] ?? ''}
              onBlur={(e) => write(tokenFor(type), e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="flex-1"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
