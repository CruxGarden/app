import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  allWorkspaces,
  shutdownWorkspaces,
  useWorkspaceRegistry,
} from '@/stores/workspaceRegistry';
import { documentsFor } from '@/services/workspace-documents';

export default function WorkspaceLifecycle() {
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entries = useWorkspaceRegistry((s) => s.entries);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (requested) cancelButton.current?.focus();
  }, [requested]);
  useEffect(() => {
    const bridge = window.electronAPI?.desktop;
    const off = bridge?.onCloseRequest?.(() => {
      const needsDecision = allWorkspaces().some((w) => {
        const s = w.data.getState();
        return (
          documentsFor(w.data, w.ui).hasDirty() ||
          s.isStreaming ||
          s.publishPhase ||
          s.uploadProgress ||
          ['running', 'planning', 'checking'].includes(s.turnJob?.status ?? '') ||
          s.pendingDeletes.length ||
          w.ui.getState().pendingAgentApprovals.length
        );
      });
      if (needsDecision) setRequested(true);
      else
        void shutdownWorkspaces('save')
          .then(() => bridge.completeClose?.(true))
          .catch((e: unknown) => {
            setRequested(true);
            setError((e as Error).message);
          });
    });
    const unload = (e: BeforeUnloadEvent) => {
      if (
        !bridge?.onCloseRequest &&
        allWorkspaces().some(
          (w) => documentsFor(w.data, w.ui).hasDirty() || w.data.getState().isStreaming,
        )
      )
        e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      off?.();
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  const cancel = () => {
    if (busy) return;
    setRequested(false);
    setError('');
    window.electronAPI?.desktop.completeClose?.(false);
  };
  const finish = async (documents: 'save' | 'discard') => {
    setBusy(true);
    setError('');
    try {
      await shutdownWorkspaces(documents);
      window.electronAPI?.desktop.completeClose?.(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!requested) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
        if (e.key === 'Tab') {
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ];
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === buttons.length - 1)) {
            e.preventDefault();
            buttons[e.shiftKey ? buttons.length - 1 : 0]?.focus();
          }
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Close Crux Garden"
        className="bg-surface-solid border border-border p-5 rounded text-text max-w-lg"
      >
        <h2>Close Crux Garden?</h2>
        <p className="text-sm my-2">
          These workspaces have unsaved edits or ongoing work. Running turns will stop; queued
          prompts will wait when you reopen.
        </p>
        <ul>
          {entries.map((e) => (
            <li key={e.id}>
              {e.title} · {e.status}
              {e.dirty ? ' · Unsaved edits' : ''}
            </li>
          ))}
        </ul>
        <div className="flex gap-4 mt-4">
          <button ref={cancelButton} disabled={busy} onClick={cancel}>
            Cancel
          </button>
          <button disabled={busy} onClick={() => void finish('discard')}>
            Discard edits and exit
          </button>
          <button disabled={busy} onClick={() => void finish('save')}>
            Save and exit
          </button>
        </div>
        {error && (
          <p role="alert" className="text-error mt-3">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
