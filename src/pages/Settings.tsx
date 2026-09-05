import AccountSettings from '@/components/settings/AccountSettings';
import SyncSettings from '@/components/settings/SyncSettings';
import UsageSettings from '@/components/settings/UsageSettings';
import PlanSettings from '@/components/settings/PlanSettings';
import DataSettings from '@/components/settings/DataSettings';
import DesktopSettings from '@/components/settings/DesktopSettings';
import AiSettings from '@/components/settings/AiSettings';
import AgentsSettings from '@/components/settings/AgentsSettings';
import MemorySettings from '@/components/settings/MemorySettings';

export default function Settings() {
  return (
    <div
      className="overflow-y-auto flex-1 flex flex-col gap-4"
      style={
        {
          // Settings surfaces read their own token family (settings*)
          '--panel': 'var(--settings-panel)',
          '--panel-border': 'var(--settings-panel-border)',
          '--caption': 'var(--settings-label)',
          '--heading': 'var(--settings-value)',
          '--border': 'var(--settings-divider)',
        } as React.CSSProperties
      }
    >
      <AccountSettings />
      <AiSettings />
      <MemorySettings />
      <AgentsSettings />
      <SyncSettings />
      <PlanSettings />
      <UsageSettings />
      <DataSettings />
      <DesktopSettings />
    </div>
  );
}
