import { useState } from 'react';
import { useWorkspaceUIStore, useWorkspaceUIStoreApi, type PaneType } from '@/stores/uiStore';
import { focusWorkspacePanel } from '@/services/workspace-layouts';
import { toast } from '@/stores/toastStore';
import { LayoutIcon } from '@/components/ui/icons';

export default function PaneFocusButton({ pane, label }: { pane: PaneType; label: string }) {
  const ui = useWorkspaceUIStoreApi();
  const focused = useWorkspaceUIStore((s) => s.focusedPane);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-focus-pane={pane}
      disabled={busy}
      aria-label={focused ? 'Restore panels' : `Focus ${label}`}
      title={focused ? 'Restore panels' : `Focus ${label}`}
      className="pane-toolbar-focus shrink-0 ml-auto px-2 py-1 text-xxs rounded-[var(--radius-sm)] text-text-muted hover:bg-action-button-hover hover:text-text motion-press cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        setBusy(true);
        const restoring = !!focused;
        void focusWorkspacePanel(ui, restoring ? null : pane)
          .then(() => {
            requestAnimationFrame(() =>
              document.querySelector<HTMLButtonElement>(`.pane-${pane} [data-focus-pane]`)?.focus(),
            );
          })
          .catch((error) => toast(String(error), { tone: 'error' }))
          .finally(() => setBusy(false));
      }}
    >
      <span className="pane-focus-label">{focused ? 'Restore' : 'Focus'}</span>
      <span className="pane-focus-icon" aria-hidden="true">
        <LayoutIcon size={14} />
      </span>
    </button>
  );
}
