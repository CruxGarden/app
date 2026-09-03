import { useDialogStore } from '@/stores/dialogStore';
import Modal from './Modal';
import Button from './Button';

/**
 * Renders the app's current confirm/alert request (see stores/dialogStore).
 * Mount exactly once, high in the tree (Shell).
 */
export default function DialogHost() {
  const req = useDialogStore((s) => s.queue[0] ?? null);
  const settle = useDialogStore((s) => s.settle);
  if (!req) return null;

  const cancel = () => settle(req.id, false);
  const ok = () => settle(req.id, true);

  return (
    <Modal
      open
      onClose={cancel}
      size="sm"
      title={req.title ?? (req.kind === 'alert' ? 'Notice' : 'Are you sure?')}
    >
      <div role={req.kind === 'alert' ? 'alertdialog' : 'dialog'} className="flex flex-col gap-4">
        <p className="text-sm text-text whitespace-pre-line">{req.message}</p>
        <div className="flex justify-end gap-2">
          {req.kind === 'confirm' && (
            <Button variant="ghost" size="sm" onClick={cancel} autoFocus={!req.danger}>
              {req.cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button
            size="sm"
            variant={req.danger ? 'danger' : 'primary'}
            onClick={ok}
            autoFocus={req.kind === 'alert' || !!req.danger}
          >
            {req.confirmLabel ?? (req.kind === 'alert' ? 'OK' : 'Confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
