import { useState } from 'react';
import { Modal } from '@/components/ui';
import Cruxspaces from '@/components/garden/Cruxspaces';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';

export default function CruxspaceAssetsButton() {
  const workspace = useCruxStoreApi();
  const id = useCruxStore((s) => s.crux?.id);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId);
  const [open, setOpen] = useState(false);
  if (!id || historical) return null;
  return (
    <>
      <button
        className="text-xs px-2 py-1 rounded-[var(--radius-sm)] hover:bg-accent-muted text-text-muted cursor-pointer"
        onClick={() => setOpen(true)}
      >
        Cruxspace assets
      </button>
      <Modal open={open} title="Cruxspace assets" size="xl" onClose={() => setOpen(false)}>
        <Cruxspaces
          targetId={id}
          runOperation={(operation) =>
            trackWorkspacePromise(
              workspace,
              Promise.resolve().then(() => {
                if (
                  workspace.getState().viewingSnapshotId ||
                  workspace.getState().closing ||
                  workspace.getState().crux?.id !== id
                )
                  throw new Error('Return to the current Crux before using an asset.');
                return operation();
              }),
            )
          }
        />
      </Modal>
    </>
  );
}
