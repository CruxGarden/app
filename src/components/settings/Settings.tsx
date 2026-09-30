import { useRef } from 'react';
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
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const groups = [
    {
      id: 'account',
      label: 'Account',
      content: (
        <>
          <AccountSettings />
          <PlanSettings />
          <UsageSettings />
        </>
      ),
    },
    {
      id: 'ai',
      label: 'AI and agents',
      content: (
        <>
          <AiSettings />
          {aiEnabled && <MemorySettings />}
          {aiEnabled && <AgentsSettings />}
        </>
      ),
    },
    {
      id: 'garden',
      label: 'Garden and backups',
      content: (
        <>
          <DesktopSettings />
          <DataSettings />
          <SyncSettings />
        </>
      ),
    },
    {
      id: 'appearance',
      label: 'Appearance and panels',
      content: (
        <>
          <NamesSettings />
          <WorkspaceLayoutsSettings />
        </>
      ),
    },
  ];
  return (
    <div
      className="@container/settings min-w-0 min-h-0 flex-1 flex flex-col"
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
      <nav aria-label="Settings sections" className="flex flex-wrap gap-1.5 pb-3 shrink-0">
        {groups.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-text-muted bg-panel hover:bg-action-button-hover hover:text-text cursor-pointer"
            onClick={() => {
              const section = sections.current[id];
              section?.scrollIntoView({ block: 'start' });
              section?.focus({ preventScroll: true });
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto pr-3 space-y-6">
        {groups.map(({ id, label, content }) => (
          <section
            key={id}
            aria-label={label}
            tabIndex={-1}
            ref={(element) => {
              sections.current[id] = element;
            }}
            className="min-w-0 space-y-3 outline-none"
          >
            <h2 className="text-xs font-medium text-text-muted">{label}</h2>
            {content}
          </section>
        ))}
      </div>
    </div>
  );
}
