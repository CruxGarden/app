import { useAiEnabled } from '@/hooks/useAiEnabled';
import WorkspaceLayoutsSettings from '@/components/settings/WorkspaceLayoutsSettings';
import AccountSettings from '@/components/settings/AccountSettings';
import NamesSettings from '@/components/settings/NamesSettings';
import SyncSettings from '@/components/settings/SyncSettings';
import UsageSettings from '@/components/settings/UsageSettings';
import PlanSettings from '@/components/settings/PlanSettings';
import DataSettings from '@/components/settings/DataSettings';
import DesktopSettings from '@/components/settings/DesktopSettings';
import AiSettings from '@/components/settings/AiSettings';
import AgentsSettings from '@/components/settings/AgentsSettings';
import MemorySettings from '@/components/settings/MemorySettings';

export default function Settings() {
  // With AI tools off, what only the collaborator uses is not shown at all.
  const aiEnabled = useAiEnabled();
  return (
    <div
      className="@container/settings min-w-0 overflow-y-auto flex-1 flex flex-col gap-4 pr-3"
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
      <NamesSettings />
      <WorkspaceLayoutsSettings />
      <AiSettings />
      {aiEnabled && <MemorySettings />}
      {aiEnabled && <AgentsSettings />}
      <SyncSettings />
      <PlanSettings />
      <UsageSettings />
      <DataSettings />
      <DesktopSettings />
    </div>
  );
}
