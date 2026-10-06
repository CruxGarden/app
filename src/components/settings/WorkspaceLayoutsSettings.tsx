import { useEffect, useState } from 'react';
import SettingsSection from './SettingsSection';
import { useWorkspaceUIStoreApi, useWorkspaceUIStore } from '@/stores/uiStore';
import { Button, Input } from '@/components/ui';
import {
  listWorkspaceLayouts,
  onWorkspaceLayoutsChange,
  saveWorkspaceLayout,
  applyWorkspaceLayout,
  arrangeWorkspacePanels,
  applyWorkspacePreset,
  deleteWorkspaceLayout,
} from '@/services/workspace-layouts';

export default function WorkspaceLayoutsSettings() {
  const ui = useWorkspaceUIStoreApi();
  const cruxId = useWorkspaceUIStore((s) => s.activeCruxId);
  const [layouts, setLayouts] = useState(listWorkspaceLayouts);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onWorkspaceLayoutsChange(() => setLayouts(listWorkspaceLayouts())), []);
  return (
    <SettingsSection
      title="Workspace layouts"
      description="Save an arrangement of panels and reuse it in the Crux you’re working on. Your files and drafts stay where they are."
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {(['make', 'review'] as const).map((preset) => (
          <Button
            key={preset}
            size="sm"
            disabled={!cruxId || busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void applyWorkspacePreset(ui, preset)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {preset === 'make' ? 'Make: Workshop + Artifacts' : 'Review: Workshop + Share'}
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        className="mb-3"
        disabled={!cruxId || busy}
        onClick={() => {
          setBusy(true);
          setError('');
          void arrangeWorkspacePanels(ui)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
      >
        Arrange open panels
      </Button>
      <div className="flex gap-2">
        <Input
          aria-label="Workspace layout name"
          placeholder="Writing, research, making music…"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          disabled={!name.trim() || !cruxId || busy}
          onClick={() => {
            try {
              saveWorkspaceLayout(name, ui.getState().mosaicLayout);
              setName('');
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Save workspace layout
        </Button>
      </div>
      <p className="text-xs text-text-muted mt-2">
        {cruxId
          ? 'Saving with the same name replaces that arrangement.'
          : 'Open a Crux to save or apply a workspace layout.'}
      </p>
      {error && (
        <p role="alert" className="text-xs text-error mt-2">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2 mt-3">
        {layouts.map((layout) => (
          <li
            key={layout.name}
            className="flex items-center justify-between gap-3 border-b border-border pb-2"
          >
            <span className="text-sm text-text">{layout.name}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!cruxId || busy}
                aria-label={`Apply workspace layout ${layout.name}`}
                onClick={() => {
                  setBusy(true);
                  setError('');
                  void applyWorkspaceLayout(ui, layout.name)
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Apply
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={`Delete workspace layout ${layout.name}`}
                onClick={() => deleteWorkspaceLayout(layout.name)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!layouts.length && (
        <p className="text-xs text-text-muted mt-3">
          Arrange your panels, then save your first workspace layout.
        </p>
      )}
    </SettingsSection>
  );
}
