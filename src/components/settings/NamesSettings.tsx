import { useEffect, useState } from 'react';
import { paneOffered } from '@/components/workspace/paneConfig';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
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
  const aiEnabled = useAiEnabled();
  const advancedMode = useAdvancedMode();
  const [tick, setTick] = useState(0);
  useEffect(() => onThemeOverridesChange(() => setTick((t) => t + 1)), []);
  void tick;
  const current = getThemeOverrides('Dark');
  const garden = useGardenContext((s) => s.garden);
  const [error, setError] = useState('');
  // External renames (including Run setup again) update the field unless the
  // person has a draft. A late save must never clear newer typing.
  const [titleDraft, setTitleDraft] = useState<{ gardenId: string; value: string } | null>(null);
  const draft = titleDraft?.gardenId === garden?.id ? titleDraft : null;

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
      description="Name your Garden. You can also give its panels your own names."
    >
      <label className="flex flex-col gap-1 mb-4">
        <SectionLabel tone="muted">Garden title</SectionLabel>
        <Input
          key={garden?.id}
          aria-label="Garden title"
          placeholder="The Bachelor Pad, Floyd County Police Department…"
          value={draft?.value ?? garden?.title ?? ''}
          onChange={(event) => {
            if (garden) setTitleDraft({ gardenId: garden.id, value: event.target.value });
          }}
          disabled={!garden}
          onBlur={(e) => {
            if (!garden || !draft) return;
            if (e.target.value.trim() === (garden.title ?? '')) {
              setTitleDraft(null);
              return;
            }
            setError('');
            void renameGarden(garden.id, e.target.value)
              .then(() => setTitleDraft((current) => (current === draft ? null : current)))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {error && (
          <span role="alert" className="text-xxs text-error">
            {error}
          </span>
        )}
      </label>
      <details>
        <summary className="cursor-pointer text-sm text-text rounded-[var(--radius-sm)] px-1 py-1">
          Custom panel names
        </summary>
        <p className="text-xs text-text-muted my-2">
          Optional: make the workspace vocabulary your own. Leave a field empty to use its usual
          name.
        </p>
        <div className="grid grid-cols-1 @min-[600px]/settings:grid-cols-2 gap-x-6 gap-y-2">
          {PANES.filter((type) => paneOffered(type, aiEnabled, advancedMode)).map((type) => (
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
      </details>
    </SettingsSection>
  );
}
