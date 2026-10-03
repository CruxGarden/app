import IncludedStatus from '@/components/chat/IncludedStatus';
import { useIncludedAccess } from '@/services/included-access';
import { ApiKeySetup, Toggle } from '@/components/ui';
import SettingsSection from './SettingsSection';

import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useUIStore } from '@/stores/uiStore';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import AgentMetricsSection from './AgentMetricsSection';

export default function AiSettings() {
  const aiEnabled = useAiEnabled();
  const included = useIncludedAccess((s) => s.usage?.eligible);

  const handleAiToggle = (enabled: boolean) => {
    setSetting(SettingsKey.AiEnabled, enabled ? 'true' : 'false');
    useUIStore.getState().setAiEnabled(enabled);
  };

  return (
    <SettingsSection title="AI" collapsible>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Toggle checked={aiEnabled} onChange={handleAiToggle} label="Enable AI Tools" />
        </div>
        {aiEnabled && <IncludedStatus />}
        {aiEnabled &&
          (included ? (
            <details>
              <summary className="text-sm text-accent cursor-pointer">
                Use your own provider or local AI
              </summary>
              <ApiKeySetup />
            </details>
          ) : (
            <ApiKeySetup />
          ))}
        {aiEnabled && (
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 font-display text-xs font-medium text-text">Metrics</h3>
            <AgentMetricsSection />
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
