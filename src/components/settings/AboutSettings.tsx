import SettingsSection from './SettingsSection';
import AboutContent from './AboutContent';

/** Settings → About: version, where the project lives, notices, shortcuts, reporting. */
export default function AboutSettings() {
  return (
    <SettingsSection title="About" testId="about-settings">
      <AboutContent />
    </SettingsSection>
  );
}
