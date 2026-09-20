import { useEffect } from 'react';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { getServices, isServicesReady } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { isPreviewOrigin } from './useStoreProxy';
import type { ComposeVerb } from '@/services/containers';

/**
 * The Stack bench, from the preview: the page asks what this machine runs
 * stacks with, what the crux's compose file says, what is running, and for the
 * compose verbs themselves. The page never touches a container; the app does,
 * through the shell's audited seam — working directory pinned to the crux
 * folder, project name fixed to the crux, the file read before every start
 * (`electron/src/containers.ts`). Same shape as the Media and Store proxies
 * beside it.
 */
export function useStackProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();

  useEffect(() => {
    if (!cruxId) return;

    const frameFor = (e: MessageEvent) =>
      [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === e.source && f.dataset.cruxId === cruxId,
      );

    async function handle(e: MessageEvent) {
      const type = e.data?.type as string | undefined;
      if (!type?.startsWith('crux:stack:')) return;
      if (workspace.getState().closing || !isPreviewOrigin(e.origin)) return;
      const frame = frameFor(e);
      if (!frame || new URL(frame.src, location.href).origin !== e.origin) return;
      if (!isServicesReady() || !e.source) return;

      const id = e.data.id as string;
      const source = e.source;
      const answer = (value: unknown, error?: string) =>
        source.postMessage({ type: `${type}:res`, id, value, error }, { targetOrigin: e.origin });
      const track = <T>(p: Promise<T>) => trackWorkspacePromise(workspace, p);

      try {
        const containers = await import('@/services/containers');
        switch (type) {
          case 'crux:stack:runner':
            answer(await track(containers.composeRunner(e.data.refresh === true)));
            break;
          case 'crux:stack:inspect':
            answer(await track(containers.inspectCompose(cruxId!)));
            break;
          case 'crux:stack:services':
            answer(await track(containers.runningServices(cruxId!)));
            break;
          case 'crux:stack:compose': {
            const verb = String(e.data.verb ?? '') as ComposeVerb;
            answer(
              await track(
                containers.compose(cruxId!, verb, {
                  service: e.data.service ? String(e.data.service) : undefined,
                  tail: typeof e.data.tail === 'number' ? e.data.tail : undefined,
                }),
              ),
            );
            break;
          }
          case 'crux:stack:read': {
            const path = String(e.data.path ?? '');
            const artifacts = await track(getServices().artifact.findByResource('crux', cruxId!));
            const file = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === path);
            if (!file) return answer('');
            answer(await (await getServices().artifact.downloadBlob(file.id)).text());
            break;
          }
          case 'crux:stack:write': {
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

  // Ask once whether this Crux carries a stack, so the compose tools are
  // offered where they mean something and nowhere else.
  useEffect(() => {
    if (!cruxId) return;
    let live = true;
    void import('@/services/containers').then(async ({ inspectCompose, markStackCrux }) => {
      try {
        const reading = await inspectCompose(cruxId);
        if (live) markStackCrux(cruxId, reading.services.length > 0);
      } catch {
        /* no shell, or no folder — not a stack either way */
      }
    });
    return () => {
      live = false;
      void import('@/services/containers').then(({ markStackCrux }) =>
        markStackCrux(cruxId, false),
      );
    };
  }, [cruxId]);

  // Lines from a run in flight reach the page as they arrive: pulling images
  // is slow, and silence looks like a hang.
  useEffect(() => {
    if (!cruxId) return;
    let stop: (() => void) | undefined;
    void import('@/services/containers').then(({ onComposeOutput }) => {
      stop = onComposeOutput((event) => {
        if (event.cruxId !== cruxId) return;
        for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')) {
          if (frame.dataset.cruxId !== cruxId) continue;
          frame.contentWindow?.postMessage(
            { type: 'crux:stack:output', verb: event.verb, line: event.line },
            new URL(frame.src, location.href).origin,
          );
        }
      });
    });
    return () => stop?.();
  }, [cruxId]);
}
