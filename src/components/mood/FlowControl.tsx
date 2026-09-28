import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useEffect, useId, useState } from 'react';
import { Toggle } from '@/components/ui';
import { readFlowSettings } from '@/lib/moods/flow';
import {
  applyActiveMood,
  getThemeOverrides,
  resolvedSection,
  setThemeOverrides,
} from '@/lib/moods/active';

/** Ordinary Mood tokens: saved with a Mood, and editable by the collaborator. */
export default function FlowControl() {
  const [settings, setSettings] = useState(readFlowSettings);
  const id = useId();
  const aiEnabled = useAiEnabled();
  useEffect(() => {
    const update = () => setSettings(readFlowSettings());
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  const change = (tokens: Record<string, string>) => {
    const section = resolvedSection();
    setThemeOverrides(section, { ...getThemeOverrides(section), ...tokens });
    applyActiveMood(section);
  };
  return (
    <section
      aria-label="Flow settings"
      className="flex flex-col gap-3 pb-4 mb-4 border-b border-border"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 id={`${id}-title`} className="text-sm font-display text-text">
            Flow
          </h3>
          <p id={`${id}-description`} className="text-xs text-text-muted mt-1">
            Bring your garden to life. As you{aiEnabled ? ' and your collaborators' : ''} create,
            iridescent borders light up. When you pause, they gently settle.
          </p>
        </div>
        <Toggle
          checked={settings.enabled}
          onChange={(on) => change({ flowEnabled: on ? 'on' : 'off' })}
          labelledBy={`${id}-title`}
          describedBy={`${id}-description`}
        />
      </div>
      <div className={settings.enabled ? '' : 'opacity-50'}>
        <label htmlFor={`${id}-sensitivity`} className="text-xs text-text-muted">
          Sensitivity
        </label>
        <input
          id={`${id}-sensitivity`}
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(settings.sensitivity * 100)}
          disabled={!settings.enabled}
          aria-valuetext={`${Math.round(settings.sensitivity * 100)} percent`}
          onChange={(e) => change({ flowSensitivity: String(Number(e.target.value) / 100) })}
          className="w-full accent-accent cursor-pointer disabled:cursor-default"
        />
        <div className="flex justify-between gap-4 text-2xs text-text-muted">
          <span>Builds with sustained activity</span>
          <span>Responds to almost every action</span>
        </div>
      </div>
    </section>
  );
}
