import { useSetting } from '@/hooks/useSetting';
import { Toggle } from '@/components/ui';
import SettingsSection from './SettingsSection';
import { SettingsKey } from '@/lib/constants';
import { setSetting } from '@/services/settings';

export default function StartSettings() {
  const celebrate = useSetting(SettingsKey.CelebratePublication) !== 'false';
  const resume = useSetting(SettingsKey.ResumeWorkspace) === 'true';
  return (
    <SettingsSection
      title="When I open Crux Garden"
      description="Pick up where you left off, or enjoy the welcome page each time."
    >
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
