import { useEffect } from 'react';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { getServices, isServicesReady } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { isPreviewOrigin } from './useStoreProxy';

/**
 * The Project bench, from the preview: the page asks the app to open the
 * folder picker, read a checkout's scripts, and run one. The page never spawns
 * anything; the shell does, and only for a folder the person chose in the OS
 * dialog (`electron/src/project-runner.ts`).
 */
export function useProjectProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();

  useEffect(() => {
    if (!cruxId) return;

    const frameFor = (e: MessageEvent) =>
      [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === e.source && f.dataset.cruxId === cruxId,
      );

    async function handle(e: MessageEvent) {
      const type = e.data?.type as string | undefined;
      if (!type?.startsWith('crux:project:')) return;
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
        const runner = await import('@/services/project-runner');
        switch (type) {
          case 'crux:project:choose':
            answer(await track(runner.chooseProject()));
            break;
          case 'crux:project:read':
            answer(await track(runner.readProject(String(e.data.folder ?? ''))));
            break;
          case 'crux:project:state':
            answer(await track(runner.projectState(cruxId!)));
            break;
          case 'crux:project:start':
            answer(
              await track(
                runner.startProject(
                  cruxId!,
                  String(e.data.folder ?? ''),
                  String(e.data.script ?? ''),
                  {
                    args: Array.isArray(e.data.args) ? e.data.args.map(String) : [],
                    port: typeof e.data.port === 'number' ? e.data.port : undefined,
                    env:
                      e.data.env && typeof e.data.env === 'object'
                        ? (e.data.env as Record<string, string>)
                        : undefined,
                  },
                ),
              ),
            );
            break;
          case 'crux:project:stop':
            answer(await track(runner.stopProject(cruxId!)));
            break;
          case 'crux:project:read-file': {
            const path = String(e.data.path ?? '');
            const artifacts = await track(getServices().artifact.findByResource('crux', cruxId!));
            const file = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === path);
            if (!file) return answer('');
            answer(await (await getServices().artifact.downloadBlob(file.id)).text());
            break;
          }
          case 'crux:project:write': {
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

  // A Crux with a project.json is a Project Crux, and gets the project tools.
  useEffect(() => {
    if (!cruxId) return;
    let live = true;
    void (async () => {
      const { markProjectCrux } = await import('@/services/project-runner');
      try {
        const artifacts = await getServices().artifact.findByResource('crux', cruxId);
        const has = artifacts.some((a) => a.type === 'artifact' && pathOf(a) === 'project.json');
        if (live) markProjectCrux(cruxId, has);
      } catch {
        /* not a project crux, then */
      }
    })();
    return () => {
      live = false;
      void import('@/services/project-runner').then(({ markProjectCrux }) =>
        markProjectCrux(cruxId, false),
      );
    };
  }, [cruxId]);
}
