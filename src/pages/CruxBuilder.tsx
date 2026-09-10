import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import TaskBar from '@/components/workspace/TaskBar';
import { findWorkingCopy } from '@/services/working-copies';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import {
  activateWorkspace,
  closeWorkspace,
  leaveWorkspaceView,
  type Workspace,
} from '@/stores/workspaceRegistry';
import { WorkspaceContext } from '@/stores/workspaceSelection';
import { WorkspaceLayout } from '@/components/workspace';
import SnapshotBanner from '@/components/growth/SnapshotBanner';
import { APP_NAME } from '@/lib/constants';
import { pathOf, normalizePath } from '@/lib/artifact-path';

export default function CruxBuilder() {
  const { id: cruxId } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const taskId = search.get('task');
  const id = taskId ?? cruxId;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    void (async () => {
      if (taskId) {
        const copy = await findWorkingCopy(taskId);
        if (!copy || copy.cruxId !== cruxId || copy.role !== 'task')
          throw new Error('This task does not belong to this Crux.');
      }
      return activateWorkspace(id);
    })()
      .then((w) => {
        if (!cancelled) setWorkspace(w);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
      leaveWorkspaceView();
    };
  }, [id, cruxId, taskId, retry]);
  if (error)
    return (
      <div role="alert" className="p-8">
        <h1>Could not open this Crux</h1>
        <p>{error}</p>
        <button
          onClick={async () => {
            if (!id) return;
            try {
              await closeWorkspace(id, { stop: true, documents: 'discard' });
              setRetry((n) => n + 1);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Retry
        </button>
        <Link to="/home">Back to your garden</Link>
      </div>
    );
  if (!workspace || workspace.id !== id)
    return (
      <div role="status" className="p-8">
        Opening Crux…
      </div>
    );
  return (
    <WorkspaceContext.Provider value={workspace}>
      <Builder key={id} />
    </WorkspaceContext.Provider>
  );
}
function Builder() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const ui = useWorkspaceUIStoreApi();
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (!crux) return;
    const state = ui.getState();
    if (previous.current === null && !state.editor.tabs.length) {
      const index = artifacts.find((a) => normalizePath(pathOf(a)).toLowerCase() === 'index.html');
      if (index) {
        state.openFile(index.id, pathOf(index));
        state.setTabViewMode(index.id, 'preview');
        state.setPaneVisible('workshop', true);
      }
    }
    if (
      previous.current === 0 &&
      artifacts.length > 0 &&
      !state.paneVisibility.artifacts &&
      !state.paneVisibility.workshop
    ) {
      state.setPaneVisible('artifacts', true);
      state.setPaneVisible('workshop', true);
    }
    previous.current = artifacts.length;
  }, [crux, artifacts, ui]);
  useEffect(() => {
    document.title = crux?.title || APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [crux?.title]);
  return (
    <div className="h-full flex flex-col min-h-0" data-workspace-id={crux?.id}>
      <h1 tabIndex={-1} className="sr-only" data-workspace-heading>
        {crux?.title}
      </h1>
      <SnapshotBanner />
      <TaskBar />
      <div className="flex-1 min-h-0">
        <WorkspaceLayout />
      </div>
    </div>
  );
}
