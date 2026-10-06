import { useState } from 'react';
import { Modal, buttonClass } from '@/components/ui';
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
        className={buttonClass('ghost', 'xs', 'text-text-muted hover:text-text')}
        onClick={() => setOpen(true)}
      >
        Garden outputs
      </button>
      <Modal open={open} title="Garden outputs" size="xl" onClose={() => setOpen(false)}>
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
