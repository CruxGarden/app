import { Button } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import SettingsSection from './SettingsSection';

/** Settings points to the existing Mood editors; it never keeps a second appearance state. */
export default function AppearanceSettings() {
  const openMood = useUIStore((s) => s.openMood);
  return (
    <SettingsSection
      title="Appearance"
      description="A Mood controls your Garden’s colors, type, surfaces, motion and sound. Start with the guided Customizer; the full Theme Builder is there when you want more control."
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openMood('theme')}>
          Customize appearance
        </Button>
        <Button size="sm" onClick={() => openMood('moods')}>
          Choose a Mood
        </Button>
        <Button size="sm" onClick={() => openMood('sound')}>
          Sound and ambience
        </Button>
      </div>
    </SettingsSection>
  );
}
