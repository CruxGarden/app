import { useEffect } from 'react';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { isServicesReady } from '@/services';
import { useAppStore } from '@/stores/appStore';
import { isPreviewOrigin } from './useStoreProxy';

/**
 * Crux Functions from the preview (the workspace half of `crux.fn`,
 * `crux.emit`, `crux.on`): the page in the Workshop posts `crux:fn:*` and the
 * handlers run locally (functions-runner) against the local Store. Events —
 * emitted by the page, by a handler, or by a Store write — reach frames that
 * asked with `crux:fn:on`. Same shape as the Store proxy beside it.
 */
export function useFunctionsProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();
  useEffect(() => {
    if (!cruxId) return;
    const listeners = new Set<{ source: MessageEventSource; origin: string }>();

    const frameFor = (e: MessageEvent) =>
      [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === e.source && f.dataset.cruxId === cruxId,
      );

    async function handleMessage(e: MessageEvent) {
      if (workspace.getState().closing || !isPreviewOrigin(e.origin)) return;
      const type = e.data?.type as string | undefined;
      if (!type?.startsWith('crux:fn:')) return;
      const frame = frameFor(e);
      if (!frame || new URL(frame.src, location.href).origin !== e.origin) return;
      if (!isServicesReady() || !e.source) return;
      const { id, name, body, data } = e.data as {
        id?: string;
        name?: string;
        body?: unknown;
        data?: unknown;
      };
      const answer = (kind: string, payload: Record<string, unknown>) =>
        e.source!.postMessage({ type: kind, id, ...payload }, { targetOrigin: e.origin });
      const visitorId = useAppStore.getState().author?.id ?? null;
      const track = <T>(p: Promise<T>) => trackWorkspacePromise(workspace, p);
      const runner = await import('@/services/functions-runner');
      switch (type) {
        case 'crux:fn:call': {
          const r = await track(runner.callLocalFunction(cruxId!, String(name), body, visitorId));
          answer('crux:fn:call:res', {
            status: r.status,
            body: r.body,
            logs: r.logs,
            ms: r.ms,
            value: { status: r.status, body: r.body },
          });
          break;
        }
        case 'crux:fn:emit': {
          const r = await track(runner.emitLocal(cruxId!, String(name), data, visitorId));
          answer('crux:fn:emit:res', {
            event: r.event,
            handlers: r.handlers,
            refused: r.refused,
            value: {
              status: r.refused ? r.refused.status : 202,
              body: r.refused ? { error: r.refused.message } : r,
            },
          });
          break;
        }
        case 'crux:fn:on':
          listeners.add({ source: e.source, origin: e.origin });
          break;
      }
    }

    function forward(e: Event) {
      const { detail } = e as CustomEvent<{ cruxId: string; event: unknown }>;
      if (detail.cruxId !== cruxId) return;
      for (const l of listeners) {
        try {
          l.source.postMessage(
            { type: 'crux:fn:event', event: detail.event },
            { targetOrigin: l.origin },
          );
        } catch {
          listeners.delete(l);
        }
      }
    }

    const onMessage = (e: MessageEvent) => void handleMessage(e);
    window.addEventListener('message', onMessage);
    window.addEventListener('crux:functions:event', forward);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('crux:functions:event', forward);
    };
  }, [cruxId, workspace]);
}
