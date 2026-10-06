import { useSetting } from '@/hooks/useSetting';
import { Toggle } from '@/components/ui';
import SettingsSection from './SettingsSection';
import { SettingsKey } from '@/lib/constants';
import { setSetting } from '@/services/settings';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import AdvancedModeToggle from './AdvancedModeToggle';
import { NEEDS, needChoice, type SetupNeed } from '@/components/setup/setup-plan';
import { fieldClass } from '@/components/ui';

export default function StartSettings() {
  const advancedMode = useAdvancedMode();
  const interest = needChoice(useSetting(SettingsKey.SetupNeed) as SetupNeed | null);
  const celebrate = useSetting(SettingsKey.CelebratePublication) !== 'false';
  const resume = useSetting(SettingsKey.ResumeWorkspace) === 'true';
  return (
    <SettingsSection
      title="Make Crux Garden yours"
      description="Choose which controls you see, what you like making, and how you start."
    >
      <div className="mb-5">
        <AdvancedModeToggle
          checked={advancedMode}
          onChange={(on) => setSetting(SettingsKey.AdvancedMode, String(on))}
        />
      </div>
      <label className="flex flex-col gap-2 mb-5 text-sm">
        What I want to make
        <select
          className={fieldClass()}
          value={interest?.id ?? ''}
          onChange={(event) => setSetting(SettingsKey.SetupNeed, event.target.value)}
        >
          <option value="">Anything · no preference</option>
          {NEEDS.map((need) => (
            <option key={need.id} value={need.id}>
              {need.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-muted">
          Relevant starting points come first in Add Crux. You can still choose anything.
        </span>
      </label>
      <Toggle
        label="Resume my last workspace on startup"
        checked={resume}
        onChange={(value) => {
          setSetting(SettingsKey.ResumeWorkspace, String(value));
        }}
      />
      <p className="text-xs text-text-muted mt-2">
        If that project is no longer available, your Garden opens instead. This never starts an
        agent or publishes anything.
      </p>
      <div className="mt-4">
        <Toggle
          label="Celebrate my first publication"
          checked={celebrate}
          onChange={(value) => {
            setSetting(SettingsKey.CelebratePublication, String(value));
          }}
        />
        <p className="text-xs text-text-muted mt-2">
          A small acknowledgement when your first Crux goes live. Sound and motion follow your Mood
          settings. Share cards are always available in Share.
        </p>
      </div>
    </SettingsSection>
  );
}
