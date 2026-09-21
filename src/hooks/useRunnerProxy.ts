import { useEffect } from 'react';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { getServices, isServicesReady } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { isPreviewOrigin } from './useStoreProxy';

/**
 * The Runner board, from the preview (ADR 0053).
 *
 * The Runner is the one page that acts beyond its own Crux, so the rule that
 * makes that safe lives here, in the app, where the page cannot reach it:
 * **every Crux it touches is found by discovery from its own Cruxspace.** The
 * page never names a Crux id; it names a service, and the app resolves which
 * Crux that belongs to. A Runner installed from someone else's template can
 * therefore only ever act on the workspace it was installed into.
 */
export function useRunnerProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();

  useEffect(() => {
    if (!cruxId) return;

    const frameFor = (e: MessageEvent) =>
      [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === e.source && f.dataset.cruxId === cruxId,
      );

    async function handle(e: MessageEvent) {
      const type = e.data?.type as string | undefined;
      if (!type?.startsWith('crux:runner:')) return;
      if (workspace.getState().closing || !isPreviewOrigin(e.origin)) return;
      const frame = frameFor(e);
      if (!frame || new URL(frame.src, location.href).origin !== e.origin) return;
      if (!isServicesReady() || !e.source) return;

      const id = e.data.id as string;
      const source = e.source;
      const answer = (value: unknown, error?: string) =>
        source.postMessage({ type: `${type}:res`, id, value, error }, { targetOrigin: e.origin });
      const track = <T>(p: Promise<T>) => trackWorkspacePromise(workspace, p);
      /** Service names only: the page cannot name a Crux. */
      const names = (value: unknown) =>
        Array.isArray(value) ? value.map(String).filter((n) => /^[\w.-]{1,64}$/.test(n)) : [];

      try {
        switch (type) {
          case 'crux:runner:workspace': {
            const { discoverWorkspace } = await import('@/services/workspace');
            answer(await track(discoverWorkspace(cruxId!)));
            break;
          }
          case 'crux:runner:status': {
            const { workspaceStatus } = await import('@/services/runner');
            answer(await track(workspaceStatus(cruxId!)));
            break;
          }
          case 'crux:runner:start': {
            const { startWorkspace } = await import('@/services/runner');
            answer(await track(startWorkspace(cruxId!, names(e.data.names))));
            break;
          }
          case 'crux:runner:stop': {
            const { stopWorkspace } = await import('@/services/runner');
            answer(await track(stopWorkspace(cruxId!, names(e.data.names))));
            break;
          }
          case 'crux:runner:log': {
            const { workspaceLog } = await import('@/services/runner');
            const tail = typeof e.data.tail === 'number' ? e.data.tail : 200;
            answer(await track(workspaceLog(cruxId!, Math.min(Math.max(tail, 1), 2000))));
            break;
          }
          case 'crux:runner:read': {
            const path = String(e.data.path ?? '');
            const artifacts = await track(getServices().artifact.findByResource('crux', cruxId!));
            const file = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === path);
            if (!file) return answer('');
            answer(await (await getServices().artifact.downloadBlob(file.id)).text());
            break;
          }
          case 'crux:runner:write': {
            const path = String(e.data.path ?? '');
            const text = String(e.data.text ?? '');
            if (!path || path.startsWith('/') || path.includes('..'))
              return answer(null, `Not a path inside this crux: ${path}`);
            await track(
              getServices().artifact.create({
                resourceId: cruxId!,
                resourceType: 'crux',
                content: text,
                mimeType: path.endsWith('.json') ? 'application/json' : 'text/plain',
                meta: { path },
              }),
            );
            await track(workspace.getState().refreshArtifacts());
            answer({ path });
            break;
          }
          default:
            answer(null, `Unknown request: ${type}`);
        }
      } catch (err) {
        answer(null, (err as Error)?.message ?? String(err));
      }
    }

    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [cruxId, workspace]);

  // A Crux made from the Runner template gets the workspace tools.
  useEffect(() => {
    if (!cruxId) return;
    let live = true;
    void (async () => {
      const { markRunnerCrux } = await import('@/services/runner');
      const { kindOf } = await import('@/services/workspace');
      try {
        const crux = await getServices().crux.findById(cruxId);
        if (live) markRunnerCrux(cruxId, kindOf(crux).kind === 'runner');
      } catch {
        /* not a Runner, then */
      }
    })();
    return () => {
      live = false;
      void import('@/services/runner').then(({ markRunnerCrux }) => markRunnerCrux(cruxId, false));
    };
  }, [cruxId]);
}
