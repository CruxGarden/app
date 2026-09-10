import { useBlocker } from 'react-router-dom';
import {
  registerNotebookEditor,
  notebookIsOpen,
  flushNotebook,
} from '@/services/notebook-lifecycle';
import { useEffect } from 'react';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { notebookSession } from '@/services/notebook';
import { isPreviewOrigin } from './useStoreProxy';

export function useNotebookProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();
  const blocker = useBlocker(() => notebookIsOpen(cruxId));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void flushNotebook(cruxId)
      .then(() => blocker.proceed())
      .catch(() => blocker.reset());
  }, [blocker, cruxId]);
  useEffect(() => {
    if (!cruxId || workspace.getState().crux?.kind !== 'notes') return;
    const execute = notebookSession(workspace);
    let dirty = false;
    let peer: { source: MessageEventSource; origin: string } | null = null;
    const flushes = new Map<string, { resolve(): void; reject(error: Error): void }>();
    const unregister = registerNotebookEditor(cruxId, {
      dirty: () => dirty,
      flush: () => {
        if (
          peer &&
          ![...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].some(
            (frame) => frame.dataset.cruxId === cruxId && frame.contentWindow === peer!.source,
          )
        )
          peer = null;
        if (!peer)
          return dirty
            ? Promise.reject(new Error('The notebook editor is unavailable.'))
            : Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            flushes.delete(id);
            reject(new Error('Notebook save was not confirmed.'));
          }, 60000);
          flushes.set(id, {
            resolve: () => {
              clearTimeout(timer);
              resolve();
            },
            reject: (error) => {
              clearTimeout(timer);
              reject(error);
            },
          });
          peer!.source.postMessage(
            { type: 'crux:notebook:flush', id },
            { targetOrigin: peer!.origin },
          );
        });
      },
    });
    function receive(event: MessageEvent) {
      if (
        event.data?.type !== 'crux:notebook' ||
        typeof event.data.id !== 'string' ||
        !isPreviewOrigin(event.origin)
      )
        return;
      const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === event.source && f.dataset.cruxId === cruxId,
      );
      if (!frame || new URL(frame.src, location.href).origin !== event.origin) return;
      peer = { source: event.source!, origin: event.origin };
      if (workspace.getState().crux?.kind !== 'notes') return;
      if (event.data.op === 'dirty') {
        dirty = event.data.dirty === true;
        workspace.setState({});
        return;
      }
      if (event.data.op === 'flushed') {
        const pending = flushes.get(event.data.flushId);
        flushes.delete(event.data.flushId);
        if (event.data.error) pending?.reject(new Error(event.data.error));
        else pending?.resolve();
        return;
      }
      const answer = (result: unknown, error?: string) =>
        event.source?.postMessage(
          { type: 'crux:notebook:result', id: event.data.id, result, error },
          { targetOrigin: event.origin },
        );
      void trackWorkspacePromise(workspace, execute(event.data)).then(
        (result) => answer(result),
        (error) => answer(null, error instanceof Error ? error.message : 'Notebook save failed.'),
      );
    }
    window.addEventListener('message', receive);
    return () => {
      unregister();
      window.removeEventListener('message', receive);
      for (const pending of flushes.values())
        pending.reject(new Error('Notebook editor closed before saving.'));
    };
  }, [cruxId, workspace]);
}
