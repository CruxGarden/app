import WorkspaceStatus from '@/components/workspace/WorkspaceStatus';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getServices } from '@/services';
import { Button } from '@/components/ui';
import { gardenPath } from '@/stores/gardenContext';
import TendingDestination from '@/components/workspace/TendingDestination';
import { copyIdentity, findWorkingCopy } from '@/services/working-copies';
import { useCruxStore } from '@/stores/cruxStore';
import {
  activateWorkspace,
  closeWorkspace,
  leaveWorkspaceView,
  getWorkspace,
  useWorkspaceRegistry,
} from '@/stores/workspaceRegistry';
import { WorkspaceContext } from '@/stores/workspaceSelection';
import { WorkspaceLayout } from '@/components/workspace';
import SnapshotBanner from '@/components/growth/SnapshotBanner';
import CruxspaceMomentBanner from '@/components/growth/CruxspaceMomentBanner';
const GrowthExplorer = lazy(() => import('@/components/growth/GrowthExplorer'));
import CruxDimensions from '@/components/layout/CruxDimensions';
import { APP_NAME } from '@/lib/constants';

export default function CruxBuilder() {
  const navigate = useNavigate();
  const { id: cruxId } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const taskId = search.get('task');
  const id = taskId ?? cruxId;
  const entry = useWorkspaceRegistry((s) => s.entries.find((e) => e.id === id));
  const workspace = entry && id ? getWorkspace(id) : undefined;
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    void (async () => {
      if (!taskId) {
        const crux = await getServices().crux.findById(id);
        if (cancelled) return;
        if (crux.kind === 'garden') {
          navigate(gardenPath(crux.id), { replace: true });
          return;
        }
      }
      if (taskId) {
        const copy = await findWorkingCopy(taskId);
        if (!copy || copy.cruxId !== cruxId || copy.role !== 'task')
          throw new Error('This task does not belong to this Crux.');
      }
      return activateWorkspace(id);
    })().catch((e: unknown) => {
      if (!cancelled) setError((e as Error).message);
    });
    return () => {
      cancelled = true;
      leaveWorkspaceView();
    };
  }, [id, cruxId, taskId, retry, navigate]);
  const openError = error ?? workspace?.error;
  if (openError)
    return (
      <div role="alert" className="h-full flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-display text-lg font-medium text-text">Could not open this Crux</h1>
          <p className="text-sm text-text-muted mt-1 mb-6">{openError}</p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
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
            </Button>
            <Link to="/home">
              <Button size="sm">Back to your garden</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  if (!workspace || workspace.phase !== 'ready')
    return (
      <div
        role="status"
        className="h-full flex items-center justify-center text-sm text-text-muted"
      >
        Opening Crux…
      </div>
    );
  return (
    <WorkspaceContext.Provider value={workspace}>
      <Builder key={workspace.lifetimeId} />
    </WorkspaceContext.Provider>
  );
}
function Builder() {
  const crux = useCruxStore((s) => s.crux);
  const [search, setSearch] = useSearchParams();
  // `?growth=<checkpoint>`: arrive from the Garden history at one checkpoint.
  const growthId = search.get('growth');
  const ownerId = crux && (copyIdentity(crux)?.cruxId ?? crux.id);
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
      <WorkspaceStatus />
      <TendingDestination />
      <CruxspaceMomentBanner />
      <SnapshotBanner />
      {growthId && ownerId && (
        <Suspense fallback={null}>
          <GrowthExplorer
            key={ownerId}
            cruxId={ownerId}
            initialSelectedId={growthId}
            onClose={() => {
              const next = new URLSearchParams(search);
              next.delete('growth');
              setSearch(next, { replace: true });
            }}
          />
        </Suspense>
      )}
      <div className="flex-1 min-h-0">
        <WorkspaceLayout />
      </div>
      <CruxDimensions />
    </div>
  );
}
