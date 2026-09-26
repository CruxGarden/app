import { useState } from 'react';
import { ApiKeySetup, Toggle } from '@/components/ui';
import SettingsSection from './SettingsSection';

import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useUIStore } from '@/stores/uiStore';
import AgentMetricsSection from './AgentMetricsSection';

export default function AiSettings() {
  const [aiEnabled, setAiEnabled] = useState(() => getSetting(SettingsKey.AiEnabled) === 'true');

  const handleAiToggle = (enabled: boolean) => {
    setAiEnabled(enabled);
    setSetting(SettingsKey.AiEnabled, enabled ? 'true' : 'false');
    useUIStore.getState().setAiEnabled(enabled);
  };

  return (
    <SettingsSection title="AI" collapsible>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Toggle checked={aiEnabled} onChange={handleAiToggle} label="Enable AI Tools" />
          </div>
          {aiEnabled && <ApiKeySetup />}
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 font-display text-xs font-medium text-text">Metrics</h3>
            <AgentMetricsSection />
          </div>
        </div>
    </SettingsSection>
  );
}
