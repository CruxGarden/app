import { useEffect } from 'react';
import { getServices, isServicesReady } from '@/services';

const PREVIEW_ORIGIN = import.meta.env.VITE_PREVIEW_ORIGIN || window.location.origin;

/**
 * Listens for crux:store:* postMessages from the preview iframe
 * and proxies them to the local SQLite store service.
 *
 * Must be mounted in the workspace where cruxId is available.
 */
export function useStoreProxy(cruxId: string | null) {
  useEffect(() => {
    if (!cruxId) return;

    function reply(
      source: MessageEventSource | null,
      type: string,
      id: string,
      data: Record<string, unknown>,
    ) {
      source?.postMessage({ type, id, ...data }, { targetOrigin: PREVIEW_ORIGIN });
    }

    function handleMessage(e: MessageEvent) {
      // Only accept messages from the preview iframe origin
      if (e.origin !== PREVIEW_ORIGIN) return;
      if (!e.data?.type?.startsWith('crux:store:')) return;
      if (!isServicesReady()) return;

      const { store } = getServices();
      const { type, id, key, value, by, mode } = e.data;

      switch (type) {
        case 'crux:store:get':
          store
            .get(cruxId!, key)
            .then((val) => reply(e.source, 'crux:store:get:res', id, { value: val }))
            .catch(() => reply(e.source, 'crux:store:get:res', id, { value: null }));
          break;

        case 'crux:store:set':
          store.set(cruxId!, key, value, mode || 'protected').catch(() => {});
          break;

        case 'crux:store:inc':
          store
            .increment(cruxId!, key, by ?? 1)
            .then((val) => reply(e.source, 'crux:store:inc:res', id, { value: val }))
            .catch(() => reply(e.source, 'crux:store:inc:res', id, { value: 0 }));
          break;

        case 'crux:store:del':
          store.delete(cruxId!, key).catch(() => {});
          break;

        case 'crux:store:list':
          store
            .list(cruxId!)
            .then((entries) => {
              const keys = entries.map((e) => ({
                key: e.key,
                value: e.value,
                mode: e.mode,
                updated: e.updated,
              }));
              reply(e.source, 'crux:store:list:res', id, { keys });
            })
            .catch(() => reply(e.source, 'crux:store:list:res', id, { keys: [] }));
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [cruxId]);
}
