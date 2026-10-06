import { useState } from 'react';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useNavigate } from 'react-router-dom';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { openWorkspace } from '@/stores/workspaceRegistry';
import { documentsFor } from '@/services/workspace-documents';
import { createTask } from '@/services/tasks';
import { copyIdentity } from '@/services/working-copies';
import { isEmbeddedApp, isLocalCreationTool, embeddedContentRoot } from '@/services/embedded-app';
import { publicationPlan } from '@/services/publication-plan';
import { workshopEntry } from '@/lib/workshop-entry';
import { pathOf } from '@/lib/artifact-path';
import { can, Capability } from '@/lib/platform';
import { Modal, Button, buttonClass, fieldClass } from '@/components/ui';

/** Make a source-editing Task through the same save and copy boundary as TaskBar. */
export default function EmbeddedAppActions() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId);
  const data = useCruxStoreApi();
  const ui = useWorkspaceUIStoreApi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const aiEnabled = useAiEnabled();
  if (!isEmbeddedApp(crux) || !crux || historical) return null;
  const identity = copyIdentity(crux);
  const publication = publicationPlan(crux, artifacts);
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
  const button = buttonClass('ghost', 'xs', 'text-text-muted hover:text-text');
  return (
    <>
      {aiEnabled && (
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
      )}
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
          {!isLocalCreationTool(crux) && (
            <button className={button} onClick={() => showPane('publish')}>
              {publication.kind === 'garden-package'
                ? 'Share workspace'
                : publication.kind === 'unavailable'
                  ? 'Sharing options'
                  : 'Share selected content'}
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
        <div className="space-y-3">
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
              className={fieldClass(undefined, 'block mt-2 h-auto py-2 resize-y')}
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
