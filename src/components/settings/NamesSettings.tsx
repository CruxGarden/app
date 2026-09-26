import { useEffect, useState } from 'react';
import SettingsSection from './SettingsSection';
import { Input, SectionLabel } from '@/components/ui';
import {
  applyActiveMood,
  getThemeOverrides,
  onThemeOverridesChange,
  setThemeOverrides,
} from '@/lib/moods/active';
import type { MoodSection } from '@/lib/moods/active';
import { DEFAULT_PANE_LABELS, PANE_TYPES } from '@/components/workspace/paneConfig';
import type { PaneType } from '@/stores/uiStore';
import { useGardenContext } from '@/stores/gardenContext';
import { renameGarden } from '@/services/garden-navigation';

/**
 * Settings → Names: this Garden's name (its own title) and what its panes are
 * called. Pane names are theme overrides for both modes (a name is not a
 * colour), so a Mood the person wears later keeps them, and a Mood that sets
 * its own names is a metaphor the person can still overrule here.
 */
const SECTIONS: MoodSection[] = ['Dark', 'Light'];
const PANES = PANE_TYPES;
const tokenFor = (type: PaneType) => `paneLabel${type[0]!.toUpperCase()}${type.slice(1)}`;

export default function NamesSettings() {
  const [tick, setTick] = useState(0);
  useEffect(() => onThemeOverridesChange(() => setTick((t) => t + 1)), []);
  void tick;
  const current = getThemeOverrides('Dark');
  const garden = useGardenContext((s) => s.garden);
  const [error, setError] = useState('');

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
    <SettingsSection
      title="Names"
      testId="names-settings"
      description="What this Garden is called, and its panes. Leave a pane empty for the usual word."
    >
      <label className="flex flex-col gap-1 mb-4">
        <SectionLabel tone="muted">
          Garden title
        </SectionLabel>
        <Input
          key={garden?.id}
          aria-label="Garden title"
          placeholder="The Bachelor Pad, Floyd County Police Department…"
          defaultValue={garden?.title ?? ''}
          disabled={!garden}
          onBlur={(e) => {
            if (!garden || e.target.value.trim() === (garden.title ?? '')) return;
            setError('');
            void renameGarden(garden.id, e.target.value).catch((err: unknown) =>
              setError(err instanceof Error ? err.message : String(err)),
            );
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {error && (
          <span role="alert" className="text-xxs text-error">
            {error}
          </span>
        )}
      </label>
      <div className="grid grid-cols-1 @min-[600px]/settings:grid-cols-2 gap-x-6 gap-y-2">
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
    </SettingsSection>
  );
}
