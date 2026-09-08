import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { useEffect } from 'react';
import { getServices, isServicesReady } from '@/services';
import { Capability, can } from '@/lib/platform';
import { useAppStore } from '@/stores/appStore';
import type { StoreMode } from '@/services/sqlite/store.service';

const PREVIEW_ORIGIN = import.meta.env.VITE_PREVIEW_ORIGIN || window.location.origin;

/**
 * Whether a message may have come from this crux's preview. On the web the
 * preview is one known origin (the service-worker cache or preview.crux.garden).
 * On desktop every preview is a per-crux loopback server — the static server
 * (ADR 0003) or `astro dev` (ADR 0005) — on an ephemeral port, so any loopback
 * origin framed by the workspace is ours.
 */
export function isPreviewOrigin(origin: string): boolean {
  if (origin === PREVIEW_ORIGIN) return true;
  return can(Capability.PreviewServer) && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

/** The preview's one visitor: the author — always signed in, so every write has a writer. */
function localVisitorId(): string | null {
  return useAppStore.getState().author?.id ?? null;
}

/**
 * Listens for crux:store:* postMessages from the preview iframe
 * and proxies them to the local SQLite store service.
 *
 * Must be mounted in the workspace where cruxId is available.
 */
export function useStoreProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();
  useEffect(() => {
    if (!cruxId) return;

    function reply(
      source: MessageEventSource | null,
      origin: string,
      type: string,
      id: string,
      data: Record<string, unknown>,
    ) {
      source?.postMessage({ type, id, ...data }, { targetOrigin: origin });
    }

    function handleMessage(e: MessageEvent) {
      // Only accept messages from the preview iframe
      if (workspace.getState().closing || !isPreviewOrigin(e.origin)) return;
      const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === e.source && f.dataset.cruxId === cruxId,
      );
      if (!frame || new URL(frame.src, location.href).origin !== e.origin) return;
      if (!e.data?.type?.startsWith('crux:store:')) return;
      if (!isServicesReady()) return;

      const { store } = getServices();
      const track = <T>(p: Promise<T>) => trackWorkspacePromise(workspace, p);
      const { type, id, key, value, by } = e.data;
      const mode = (e.data.mode || 'protected') as StoreMode;
      const visitorId = localVisitorId();
      const answer = (kind: string, data: Record<string, unknown>) =>
        reply(e.source, e.origin, kind, id, data);

      switch (type) {
        case 'crux:store:get':
          track(store.get(cruxId!, key, visitorId))
            .then((val) => answer('crux:store:get:res', { value: val }))
            .catch(() => answer('crux:store:get:res', { value: null }));
          break;

        case 'crux:store:set':
          track(store.set(cruxId!, key, value, mode, visitorId)).catch(() => {});
          break;

        case 'crux:store:inc':
          track(store.increment(cruxId!, key, by ?? 1))
            .then((val) => answer('crux:store:inc:res', { value: val }))
            .catch(() => answer('crux:store:inc:res', { value: 0 }));
          break;

        case 'crux:store:del':
          track(store.delete(cruxId!, key)).catch(() => {});
          break;

        case 'crux:store:list':
          track(store.list(cruxId!))
            .then((entries) => {
              const keys = entries.map((e) => ({
                key: e.key,
                value: e.value,
                mode: e.mode,
                updated: e.updated,
              }));
              answer('crux:store:list:res', { keys });
            })
            .catch(() => answer('crux:store:list:res', { keys: [] }));
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [cruxId, workspace]);
}
