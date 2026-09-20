import { isEmbeddedApp } from '@/services/embedded-app';
import { registerAppTools, executeAppTool } from '@/services/embedded-app-tool-registry';
import { getSetting, removeSetting } from '@/services/settings';
import { embeddedAppToolAdapter } from '@/services/embedded-app-tool-adapters';
import { useBlocker } from 'react-router-dom';
import {
  registerNotebookEditor,
  notebookIsOpen,
  flushNotebook,
} from '@/services/notebook-lifecycle';
import { useEffect, useSyncExternalStore } from 'react';
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
  // Whether the Crux is an embedded app is live: a Crux marked a Tool
  // template (its kind) stops being one, and the editor registered for its
  // frame must go with the frame — a stale registration held every pane
  // toggle and the workspace's close behind a flush that could never answer.
  const embedded = useSyncExternalStore(workspace.subscribe, () =>
    isEmbeddedApp(workspace.getState().crux),
  );
  useEffect(() => {
    if (!cruxId || !embedded) return;
    const protocol = workspace.getState().crux?.kind === 'notes' ? 'crux:notebook' : 'crux:app';
    const execute = notebookSession(workspace);
    let dirty = false;
    let peer: { source: MessageEventSource; origin: string } | null = null;
    const flushes = new Map<string, { resolve(): void; reject(error: Error): void }>();
    const commands = new Map<
      string,
      { resolve(result: unknown): void; reject(error: Error): void }
    >();
    const toolAdapter = embeddedAppToolAdapter(workspace.getState().crux);
    const unregisterAppTools = toolAdapter
      ? registerAppTools(cruxId, {
          tools: toolAdapter.tools,
          execute: async (name, input) => {
            const command = toolAdapter.prepare(name, input);
            const state = workspace.getState();
            if (
              state.crux?.id !== cruxId ||
              state.viewingSnapshotId ||
              !peer ||
              ![...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].some(
                (frame) => frame.dataset.cruxId === cruxId && frame.contentWindow === peer!.source,
              )
            )
              return Promise.reject(
                new Error('Open the current app in Workshop before using its tools.'),
              );
            const wait = toolAdapter.tools.find((t) => t.name === name)?.timeoutMs ?? 60000;
            return new Promise((resolve, reject) => {
              const id = crypto.randomUUID();
              const timer = setTimeout(() => {
                commands.delete(id);
                reject(
                  new Error(
                    'App command was not confirmed. Inspect the app before retrying; a draft may remain.',
                  ),
                );
              }, wait);
              commands.set(id, {
                resolve: (result) => {
                  clearTimeout(timer);
                  resolve(result);
                },
                reject: (error) => {
                  clearTimeout(timer);
                  reject(error);
                },
              });
              peer!.source.postMessage(
                { type: `${protocol}:command`, id, command },
                { targetOrigin: peer!.origin },
              );
            });
          },
        })
      : () => {};
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
            ? Promise.reject(new Error('The app editor is unavailable.'))
            : Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            flushes.delete(id);
            reject(new Error('App save was not confirmed.'));
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
            { type: `${protocol}:flush`, id },
            { targetOrigin: peer!.origin },
          );
        });
      },
    });
    function receive(event: MessageEvent) {
      if (
        event.data?.type !== protocol ||
        typeof event.data.id !== 'string' ||
        !isPreviewOrigin(event.origin)
      )
        return;
      const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === event.source && f.dataset.cruxId === cruxId,
      );
      if (!frame || new URL(frame.src, location.href).origin !== event.origin) return;
      peer = { source: event.source!, origin: event.origin };
      if (!isEmbeddedApp(workspace.getState().crux)) return;
      // A file the Crux was started from (file-drop routing): once the app speaks, ask it to open the file.
      const pendingKey = `cruxgarden:pending-open:${cruxId}`;
      const pending = toolAdapter && cruxId ? getSetting(pendingKey) : null;
      if (pending && cruxId) {
        removeSetting(pendingKey);
        try {
          const { tool, input } = JSON.parse(pending) as {
            tool: string;
            input: Record<string, unknown>;
          };
          if (toolAdapter!.tools.some((t) => t.name === tool))
            setTimeout(() => {
              void executeAppTool(cruxId!, tool, input).catch((error) =>
                console.warn('[file-drop] the app could not open the file:', error),
              );
            }, 1500);
        } catch {
          /* a malformed note: nothing to open */
        }
      }
      if (event.data.op === 'tool-result') {
        const command = commands.get(event.data.commandId);
        commands.delete(event.data.commandId);
        if (event.data.error) command?.reject(new Error(event.data.error));
        else command?.resolve(event.data.result);
        return;
      }
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
          { type: `${protocol}:result`, id: event.data.id, result, error },
          { targetOrigin: event.origin },
        );
      void trackWorkspacePromise(workspace, execute(event.data)).then(
        (result) => answer(result),
        (error) => answer(null, error instanceof Error ? error.message : 'App save failed.'),
      );
    }
    window.addEventListener('message', receive);
    return () => {
      unregister();
      unregisterAppTools();
      window.removeEventListener('message', receive);
      for (const pending of flushes.values())
        pending.reject(new Error('App editor closed before saving.'));
      for (const pending of commands.values())
        pending.reject(
          new Error('App closed before the command was confirmed. Inspect before retrying.'),
        );
    };
  }, [cruxId, workspace, embedded]);
}
