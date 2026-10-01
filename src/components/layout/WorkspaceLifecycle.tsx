import { useModalFocus } from '@/hooks/useModalFocus';
import { keeperNeedsCloseDecision } from '@/stores/keeperStore';
import { buttonClass } from '@/components/ui/button-class';
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
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, requested, 110);
  useEffect(() => {
    if (requested) cancelButton.current?.focus();
  }, [requested]);
  useEffect(() => {
    const bridge = window.electronAPI?.desktop;
    const off = bridge?.onCloseRequest?.(() => {
      const needsDecision =
        keeperNeedsCloseDecision() ||
        allWorkspaces().some((w) => {
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
        (keeperNeedsCloseDecision() ||
          allWorkspaces().some(
            (w) => documentsFor(w.data, w.ui).hasDirty() || w.data.getState().isStreaming,
          ))
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
      className="fixed inset-0 z-[110] modal-scrim flex items-center justify-center"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Close Crux Garden"
        className="overlay-plate border border-dropdown-border p-5 rounded-[var(--radius)] shadow-modal text-text max-w-lg motion-enter-dropdown"
      >
        <h2
          className="font-medium text-accent"
          style={{ fontFamily: 'var(--dialog-title-font)', fontSize: 'var(--dialog-title-size)' }}
        >
          Close Crux Garden?
        </h2>
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
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button
            ref={cancelButton}
            disabled={busy}
            onClick={cancel}
            className={buttonClass('ghost', 'sm')}
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => void finish('discard')}
            className={buttonClass('secondary', 'sm')}
          >
            Discard edits and exit
          </button>
          <button
            disabled={busy}
            onClick={() => void finish('save')}
            className={buttonClass('primary', 'sm')}
          >
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
