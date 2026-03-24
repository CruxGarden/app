import { useState } from 'react';
import { Panel, ApiKeySetup, Toggle } from '@/components/ui';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { cn } from '@/lib/cn';

export default function AiSettings() {
  const [collapsed, setCollapsed] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(() => getSetting(SettingsKey.AiEnabled) === 'true');

  const handleAiToggle = (enabled: boolean) => {
    setAiEnabled(enabled);
    setSetting(SettingsKey.AiEnabled, enabled ? 'true' : 'false');
  };

  return (
    <Panel padding="md">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full cursor-pointer group"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('text-text-muted', collapsed ? '-rotate-90' : 'rotate-0')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <h2 className="font-display text-sm font-medium text-accent">AI</h2>
      </button>

      {!collapsed && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <Toggle checked={aiEnabled} onChange={handleAiToggle} label="Enable AI Tools" />
          </div>
          {aiEnabled && <ApiKeySetup />}
        </div>
      )}
    </Panel>
  );
}
