import { useEffect } from 'react';
import client from '@/api/client';

/**
 * Listens for crux:store:* postMessages from the published iframe
 * and proxies them to the API via HTTP.
 *
 * Used on public crux pages when the API is on localhost (Private Network
 * Access blocks the iframe from calling localhost directly).
 */
export function useStoreApiProxy(cruxId: string | null) {
  useEffect(() => {
    if (!cruxId) return;

    function reply(
      source: MessageEventSource | null,
      type: string,
      id: string,
      data: Record<string, unknown>,
    ) {
      source?.postMessage({ type, id, ...data }, { targetOrigin: '*' });
    }

    function handleMessage(e: MessageEvent) {
      if (!e.data?.type?.startsWith('crux:store:')) return;

      const { type, id, key, value, by, mode } = e.data;

      switch (type) {
        case 'crux:store:get':
          client
            .get(`/store/${cruxId}/${encodeURIComponent(key)}`)
            .then((r) => reply(e.source, 'crux:store:get:res', id, { value: r.data?.value }))
            .catch(() => reply(e.source, 'crux:store:get:res', id, { value: null }));
          break;

        case 'crux:store:set':
          client
            .put(`/store/${cruxId}/${encodeURIComponent(key)}`, {
              value,
              mode: mode || 'protected',
            })
            .catch(() => {});
          break;

        case 'crux:store:inc':
          client
            .post(`/store/${cruxId}/${encodeURIComponent(key)}/inc`, { by: by ?? 1 })
            .then((r) => reply(e.source, 'crux:store:inc:res', id, { value: r.data?.value }))
            .catch(() => reply(e.source, 'crux:store:inc:res', id, { value: 0 }));
          break;

        case 'crux:store:del':
          client.delete(`/store/${cruxId}/${encodeURIComponent(key)}`).catch(() => {});
          break;

        case 'crux:store:list':
          client
            .get(`/store/${cruxId}`)
            .then((r) => reply(e.source, 'crux:store:list:res', id, { keys: r.data }))
            .catch(() => reply(e.source, 'crux:store:list:res', id, { keys: [] }));
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [cruxId]);
}
