import SettingsSection from './SettingsSection';
import InstalledTools from './InstalledTools';
import { Button } from '@/components/ui';
import { useUIStore, useWorkspaceUIStoreApi } from '@/stores/uiStore';

export default function LibrarySettings() {
  const ui = useWorkspaceUIStoreApi();
  return (
    <SettingsSection
      title="My tools and Moods"
      description="Tools are starting points for new projects. Moods change how your Garden looks and feels."
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" onClick={() => ui.getState().setPaneVisible('explore', true)}>
          Find tools in Explore
        </Button>
        <Button size="sm" onClick={() => useUIStore.getState().openMood('moods')}>
          Manage my Moods
        </Button>
      </div>
      <InstalledTools />
    </SettingsSection>
  );
}
