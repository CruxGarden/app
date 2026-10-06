import PaneOptions from '@/components/workspace/PaneOptions';
import AppearanceSettings from './AppearanceSettings';
import StartSettings from './StartSettings';
import LibrarySettings from './LibrarySettings';
import { useEffect, useId, useRef, useState } from 'react';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import { Button, Select, SectionLabel } from '@/components/ui';
import { rowClass } from '@/components/ui/button-class';
import WorkspaceLayoutsSettings from '@/components/settings/WorkspaceLayoutsSettings';
import AccountSettings from '@/components/settings/AccountSettings';
import NamesSettings from '@/components/settings/NamesSettings';
import SyncSettings from '@/components/settings/SyncSettings';
import UsageSettings from '@/components/settings/UsageSettings';
import PlanSettings from '@/components/settings/PlanSettings';
import DataSettings from '@/components/settings/DataSettings';
import DiskUsage from '@/components/settings/DiskUsage';
import DesktopSettings from '@/components/settings/DesktopSettings';
import AiSettings from '@/components/settings/AiSettings';
import AgentsSettings from '@/components/settings/AgentsSettings';
import MemorySettings from '@/components/settings/MemorySettings';
import {
  onSettingsSection,
  settingsPlace,
  takeSettingsSection,
  type SettingsSection,
} from '@/components/settings/settings-target';

export default function Settings() {
  // With AI tools off, what only the collaborator uses is not shown at all.
  const aiEnabled = useAiEnabled();
  const advancedMode = useAdvancedMode();
  const sectionId = useId();
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const [currentSection, setCurrentSection] = useState('start');
  const groups = [
    { id: 'start', label: 'Getting started', content: <StartSettings /> },
    { id: 'library', label: 'Tools and Moods', content: <LibrarySettings /> },
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
          {aiEnabled && advancedMode && <AgentsSettings />}
          {aiEnabled && !advancedMode && (
            <p className="text-xs text-text-muted">
              For coding agents and outside connections, turn on Advanced Mode in Getting started.
            </p>
          )}
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
          <PaneOptions pane="settings" label="Storage details">
            <DiskUsage />
          </PaneOptions>
          <SyncSettings />
        </>
      ),
    },
    {
      id: 'appearance',
      label: 'Appearance and panels',
      content: (
        <>
          <AppearanceSettings />
          <NamesSettings />
          <PaneOptions pane="settings" label="Saved panel layouts">
            <WorkspaceLayoutsSettings />
          </PaneOptions>
        </>
      ),
    },
  ];
  const goToSection = (id: string, focus = true) => {
    const section = sections.current[id];
    const container = scroller.current;
    if (!section || !container) return;
    setCurrentSection(id);
    container.scrollTo({
      // Plasma can transform a pane. Scrolling uses layout coordinates, not
      // the scaled screen coordinates returned by getBoundingClientRect().
      top: section.offsetTop,
    });
    if (focus) section.focus({ preventScroll: true });
  };
  // A place asked for by name ("See Usage in Settings"): taken on mount, and
  // heard while open. Shown after layout so the cards above it have height.
  useEffect(() => {
    let frame = 0;
    const reveal = (target: SettingsSection) => {
      const { group, card } = settingsPlace(target);
      const container = scroller.current;
      const groupElement = sections.current[group];
      const element =
        (card ? groupElement?.querySelector<HTMLElement>(card) : null) ?? groupElement;
      if (!element || !container) return;
      setCurrentSection(group);
      for (
        let node: HTMLElement | null = element.parentElement;
        node && node !== container;
        node = node.parentElement
      ) {
        if (node instanceof HTMLDetailsElement) node.open = true;
      }
      // Layout coordinates (Plasma can transform a pane), summed up to the scroller.
      let top = 0;
      for (let node: HTMLElement | null = element; node && node !== container; ) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      container.scrollTo({ top });
      element.focus({ preventScroll: true });
    };
    // Taken inside the frame, so a mount that is undone before it (Strict
    // Mode) leaves the request for the mount that stays.
    const show = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = takeSettingsSection();
        if (target) reveal(target);
      });
    };
    show();
    const off = onSettingsSection(show);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, []);
  const trackSection = () => {
    const container = scroller.current;
    if (!container) return;
    const atEnd =
      container.scrollTop > 0 &&
      container.scrollHeight - container.scrollTop - container.clientHeight <= 1;
    const current = atEnd
      ? groups.at(-1)
      : [...groups]
          .reverse()
          .find(
            ({ id }) => (sections.current[id]?.offsetTop ?? Infinity) <= container.scrollTop + 8,
          );
    if (current) setCurrentSection(current.id);
  };
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
      <div className="min-h-0 min-w-0 flex-1 flex flex-col gap-4 @min-[760px]/settings:flex-row">
        <nav
          aria-label="Settings sections"
          className="shrink-0 @min-[760px]/settings:w-44 @min-[760px]/settings:border-r @min-[760px]/settings:border-border @min-[760px]/settings:pr-3 @min-[760px]/settings:overflow-y-auto"
        >
          <div className="flex items-center gap-3 @min-[760px]/settings:hidden">
            <label htmlFor={`${sectionId}-chooser`}>
              <SectionLabel tone="muted">Section</SectionLabel>
            </label>
            <Select
              id={`${sectionId}-chooser`}
              aria-label="Settings section"
              value={currentSection}
              onChange={(event) => goToSection(event.target.value, false)}
              className="min-w-0 flex-1"
            >
              {groups.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            <Button
              aria-label="Go to selected section"
              aria-controls={`${sectionId}-${currentSection}`}
              onClick={() => goToSection(currentSection)}
            >
              Go
            </Button>
          </div>
          <div className="hidden @min-[760px]/settings:flex flex-col gap-1">
            <SectionLabel tone="muted" className="px-3 mb-2">
              Sections
            </SectionLabel>
            {groups.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-current={currentSection === id ? 'location' : undefined}
                aria-controls={`${sectionId}-${id}`}
                className={rowClass(currentSection === id, 'text-sm')}
                onClick={() => goToSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div
          ref={scroller}
          onScroll={trackSection}
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto pr-3 space-y-6"
        >
          {groups.map(({ id, label, content }) => (
            <section
              key={id}
              id={`${sectionId}-${id}`}
              aria-label={label}
              tabIndex={-1}
              ref={(element) => {
                sections.current[id] = element;
              }}
              className="min-w-0 space-y-3"
            >
              <h2 className="text-xs font-medium text-text-muted">{label}</h2>
              {content}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
