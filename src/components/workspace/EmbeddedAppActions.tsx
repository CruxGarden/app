import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { openWorkspace } from '@/stores/workspaceRegistry';
import { documentsFor } from '@/services/workspace-documents';
import { createTask } from '@/services/tasks';
import { copyIdentity } from '@/services/working-copies';
import { isEmbeddedApp, isCardinal, embeddedContentRoot } from '@/services/embedded-app';
import { workshopEntry } from '@/lib/workshop-entry';
import { pathOf } from '@/lib/artifact-path';
import { can, Capability } from '@/lib/platform';
import { Modal, Button } from '@/components/ui';

/** Make a source-editing Task through the same save and copy boundary as TaskBar. */
export default function EmbeddedAppActions() {
  const crux = useCruxStore((s) => s.crux);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId);
  const data = useCruxStoreApi();
  const ui = useWorkspaceUIStoreApi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!isEmbeddedApp(crux) || !crux || historical) return null;
  const identity = copyIdentity(crux);
  const showPane = (pane: 'publish' | 'export') => {
    ui.getState().setPaneVisible(pane, true);
    ui.getState().setMobileActivePane(pane);
  };
  async function customize() {
    setBusy(true);
    setError('');
    try {
      await documentsFor(data, ui).saveAll();
      const task = identity
        ? crux!
        : await createTask(
            crux!.id,
            'Customize app',
            `Customize this app: ${prompt.trim() || 'Help me improve the app.'}\nKeep existing content in ${embeddedContentRoot(crux)} intact unless I explicitly request content changes. Review changes before merging into Main.`,
          );
      const workspace = await openWorkspace(task.id);
      const state = workspace.data.getState();
      const entry = workshopEntry(
        state.crux,
        state.artifacts,
        state.crux?.meta?.settings?.entryFile,
      );
      workspace.ui.getState().setWorkshopView('advanced');
      workspace.ui.getState().setPaneVisible('workshop', true);
      workspace.ui.getState().setPaneVisible('artifacts', true);
      workspace.ui.getState().setPaneVisible('collaboration', true);
      if (entry.artifact)
        workspace.ui.getState().openFile(entry.artifact.id, pathOf(entry.artifact));
      setOpen(false);
      navigate(`/c/${identity?.cruxId ?? crux!.id}?task=${task.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const button =
    'px-3 py-1.5 text-xs rounded-[var(--radius-sm)] hover:bg-accent-muted cursor-pointer';
  return (
    <>
      <button
        className={button}
        title="Ask the agent to help with this app or its content"
        onClick={() => {
          ui.getState().setPaneVisible('collaboration', true);
          ui.getState().setMobileActivePane('collaboration');
        }}
      >
        Ask agent
      </button>
      {can(Capability.ProjectFolder) &&
        (!identity || (identity.role === 'task' && identity.phase === 'ready')) && (
          <button
            className={button}
            disabled={busy}
            onClick={() => (identity ? void customize() : setOpen(true))}
          >
            Customize app
          </button>
        )}
      {!identity && (
        <>
          {!isCardinal(crux) && (
            <button className={button} onClick={() => showPane('publish')}>
              Share selected content
            </button>
          )}
          <button className={button} onClick={() => showPane('export')}>
            Export complete Crux
          </button>
        </>
      )}
      {error && !open && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Customize app in a Task"
      >
        <div role="dialog" aria-label="Customize app" className="space-y-3">
          <p className="text-sm text-text-muted">
            Keep using Main while you change the app in a separate Task. Review and merge when
            ready. The Task starts with a copy of your current content; changes to the same files
            may need resolving.
          </p>
          <label className="block text-sm">
            What would you like to change?
            <textarea
              aria-label="App changes"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              className="block w-full mt-2 p-2 bg-surface border border-border rounded"
              placeholder="A quieter editor, a reading mode, a new tool…"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={() => void customize()}>
            {busy ? 'Creating Task…' : 'Save and customize'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
