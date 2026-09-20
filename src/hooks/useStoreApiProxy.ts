import { useEffect } from 'react';
import client from '@/api/client';
import { searchAuthors } from '@/api/authors';
import { callFunction, emitEvent } from '@/services/crux-functions';
import { useAppStore } from '@/stores/appStore';

/**
 * Listens for crux:store:* postMessages from the published iframe and
 * proxies them to the API via HTTP — with the VIEWER's credentials, which
 * never leave this window (the published page is untrusted third-party code).
 *
 * Only messages from `allowedOrigin` (the crux's own publish origin) are
 * honoured, and replies go back to exactly that origin — any other page that
 * happens to be embedded must not be able to drive the visitor's store calls.
 */
export function useStoreApiProxy(cruxId: string | null, allowedOrigin: string | null) {
  useEffect(() => {
    if (!cruxId || !allowedOrigin) return;

    function reply(
      source: MessageEventSource | null,
      type: string,
      id: string,
      data: Record<string, unknown>,
    ) {
      source?.postMessage({ type, id, ...data }, { targetOrigin: allowedOrigin! });
    }

    function handleMessage(e: MessageEvent) {
      if (e.origin !== allowedOrigin) return;
      const t = String(e.data?.type ?? '');
      if (!/^crux:(store|fn|directory|visitor)/.test(t)) return;

      const { type, id, key, value, by, mode } = e.data;

      switch (type) {
        // The garden's functions, called as the signed-in person (GARDEN-MEMBERS-PLAN).
        case 'crux:fn:call':
          callFunction(cruxId!, String(e.data.name ?? ''), e.data.body ?? {})
            .then((r) =>
              reply(e.source, 'crux:fn:call:res', id, {
                status: r.status,
                body: r.body,
                value: { status: r.status, body: r.body },
              }),
            )
            .catch((err: Error) =>
              reply(e.source, 'crux:fn:call:res', id, {
                status: 502,
                body: { error: err.message },
                value: { status: 502, body: { error: err.message } },
              }),
            );
          break;
        case 'crux:fn:emit':
          emitEvent(cruxId!, String(e.data.name ?? ''), e.data.data ?? {})
            .then((r) =>
              reply(e.source, 'crux:fn:emit:res', id, { ...r, value: { status: 202, body: r } }),
            )
            .catch((err: Error) =>
              reply(e.source, 'crux:fn:emit:res', id, {
                value: { status: 502, body: { error: err.message } },
              }),
            );
          break;
        case 'crux:directory:search':
          searchAuthors(String(e.data.q ?? ''))
            .then((list) =>
              reply(e.source, 'crux:directory:search:res', id, {
                value: {
                  status: 200,
                  body: list.map((a) => ({
                    authorId: a.id,
                    username: a.username,
                    displayName: a.displayName,
                  })),
                },
              }),
            )
            .catch((err: Error) =>
              reply(e.source, 'crux:directory:search:res', id, {
                value: { status: 502, body: { error: err.message } },
              }),
            );
          break;
        case 'crux:visitor': {
          const a = useAppStore.getState().author;
          reply(e.source, 'crux:visitor:res', id, {
            value: a ? { id: a.id, username: a.username, name: a.displayName } : null,
          });
          break;
        }
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
            .post(`/store/${cruxId}/${encodeURIComponent(key)}/inc`, {
              by: by ?? 1,
              ...(mode ? { mode } : {}),
            })
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
  }, [cruxId, allowedOrigin]);
}
