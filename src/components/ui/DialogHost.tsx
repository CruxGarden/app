import { useState } from 'react';
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
  const [checked, setChecked] = useState<boolean | null>(null);
  if (!req) return null;

  const isChecked = checked ?? req.checkbox?.checked ?? false;
  const cancel = () => {
    setChecked(null);
    settle(req.id, false, { choice: null, checked: isChecked });
  };
  const ok = () => settle(req.id, true);
  const choose = (id: string) => {
    setChecked(null);
    settle(req.id, true, { choice: id, checked: isChecked });
  };

  if (req.kind === 'choice') {
    const choices = req.choices ?? [];
    return (
      <Modal open onClose={cancel} size="sm" title={req.title ?? 'Which way?'}>
        <div role="dialog" className="flex flex-col gap-4">
          <p className="text-sm text-text whitespace-pre-line">{req.message}</p>
          {req.checkbox && (
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setChecked(e.target.checked)}
                className="accent-accent"
              />
              {req.checkbox.label}
            </label>
          )}
          <div className="flex justify-end gap-2 flex-wrap">
            {choices.map((c, i) => (
              <Button
                key={c.id}
                size="sm"
                variant={c.variant ?? (i === choices.length - 1 ? 'primary' : 'ghost')}
                onClick={() => choose(c.id)}
                autoFocus={i === choices.length - 1}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

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
