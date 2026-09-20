import { useEffect } from 'react';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';
import { getServices, isServicesReady } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { isPreviewOrigin } from './useStoreProxy';
import type { MediaToolName } from '@/services/native-tools';
import { MEDIA_TOOL_NAMES } from '@/services/native-tools';

/**
 * The Media Tools bench, from the preview (MAKING-THE-AD-PARITY gap 13): the
 * page asks Crux Garden to list the crux's files, say what one is, and run
 * ffmpeg, ffprobe or ImageMagick inside the folder. The page never touches a
 * binary; the app does, through the shell's audited seam, as the person.
 * Same shape as the Store and Functions proxies beside it.
 */
/** Wait (briefly) for the watcher to ingest a file the tools just wrote. */
async function untilIngested(cruxId: string, path: string): Promise<void> {
  const clean = path.replace(/^\.\//, '');
  for (let i = 0; i < 40; i++) {
    const artifacts = await getServices().artifact.findByResource('crux', cruxId);
    if (artifacts.some((a) => a.type === 'artifact' && pathOf(a) === clean)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function useMediaProxy(cruxId: string | null) {
  const workspace = useCruxStoreApi();
  useEffect(() => {
    if (!cruxId) return;
    let stopProgress: (() => void) | undefined;

    const frameFor = (e: MessageEvent) =>
      [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].find(
        (f) => f.contentWindow === e.source && f.dataset.cruxId === cruxId,
      );

    async function handle(e: MessageEvent) {
      const type = e.data?.type as string | undefined;
      if (!type?.startsWith('crux:media:')) return;
      if (workspace.getState().closing || !isPreviewOrigin(e.origin)) {
        console.info(
          '[media-proxy] refused',
          type,
          'closing?',
          workspace.getState().closing,
          e.origin,
        );
        return;
      }
      const frame = frameFor(e);
      if (!frame || new URL(frame.src, location.href).origin !== e.origin) return;
      if (!isServicesReady() || !e.source) return;

      const id = e.data.id as string;
      const source = e.source;
      const answer = (value: unknown, error?: string) =>
        source.postMessage({ type: `${type}:res`, id, value, error }, { targetOrigin: e.origin });
      const track = <T>(p: Promise<T>) => trackWorkspacePromise(workspace, p);

      try {
        const native = await import('@/services/native-tools');
        switch (type) {
          case 'crux:media:files': {
            const artifacts = await track(getServices().artifact.findByResource('crux', cruxId!));
            answer(
              artifacts
                .filter((a) => a.type === 'artifact')
                .map((a) => ({ path: pathOf(a), bytes: a.size ?? null }))
                .filter((f) => f.path && !f.path.startsWith('.crux/'))
                .sort((a, b) => a.path.localeCompare(b.path)),
            );
            break;
          }
          case 'crux:media:tools':
            answer(await native.mediaTools(e.data.refresh === true));
            break;
          case 'crux:media:install': {
            const tool = String(e.data.tool ?? '') as MediaToolName;
            if (!(MEDIA_TOOL_NAMES as readonly string[]).includes(tool))
              return answer(null, `Unknown tool: ${tool}`);
            answer(await native.installMediaTool(tool));
            break;
          }
          case 'crux:media:pdf': {
            const path = String(e.data.path ?? '');
            const out = e.data.out ? String(e.data.out) : undefined;
            const made = await track(native.makePdf(cruxId!, path, { out }));
            await untilIngested(cruxId!, made.path);
            answer(made);
            break;
          }
          case 'crux:media:probe':
            answer(await track(native.probeMedia(cruxId!, String(e.data.path ?? ''))));
            break;
          case 'crux:media:run': {
            const tool = String(e.data.tool ?? '') as MediaToolName;
            if (!(MEDIA_TOOL_NAMES as readonly string[]).includes(tool))
              return answer(null, `Unknown tool: ${tool}`);
            const args = (Array.isArray(e.data.args) ? e.data.args : []).map(String);
            if (!args.length) return answer(null, 'Give the tool some arguments.');
            const run = await track(native.runMediaTool(cruxId!, tool, args));
            // The output is an ordinary file in the folder and the watcher
            // brings it in; the answer waits for that, so the page's list is
            // right the moment it refreshes.
            const out = [...args].reverse().find((a) => !a.startsWith('-'));
            if (run.code === 0 && out && !out.includes('%'))
              await track(untilIngested(cruxId!, out));
            await track(workspace.getState().refreshArtifacts());
            answer(run);
            break;
          }
          case 'crux:media:read': {
            const path = String(e.data.path ?? '');
            const artifacts = await track(getServices().artifact.findByResource('crux', cruxId!));
            const file = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === path);
            if (!file) return answer('');
            answer(await (await getServices().artifact.downloadBlob(file.id)).text());
            break;
          }
          case 'crux:media:write': {
            const path = String(e.data.path ?? '');
            const text = String(e.data.text ?? '');
            if (!path || path.startsWith('/') || path.includes('..'))
              return answer(null, `Not a path inside this crux: ${path}`);
            // `create` with a path upserts, as write_file does.
            await track(
              getServices().artifact.create({
                resourceId: cruxId!,
                resourceType: 'crux',
                content: text,
                mimeType: path.endsWith('.json') ? 'application/json' : 'text/markdown',
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
        answer(null, (err as Error).message);
      }
    }

    const onMessage = (e: MessageEvent) => void handle(e);
    window.addEventListener('message', onMessage);
    // A long encode reports progress; pass it to whichever frame is listening.
    void import('@/services/native-tools').then(({ onNativeProgress }) => {
      stopProgress = onNativeProgress?.((event) => {
        if (event.cruxId !== cruxId) return;
        for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]'))
          if (f.dataset.cruxId === cruxId)
            f.contentWindow?.postMessage(
              { type: 'crux:media:progress', progress: event.progress, tool: event.tool },
              '*',
            );
      });
    });
    return () => {
      window.removeEventListener('message', onMessage);
      stopProgress?.();
    };
  }, [cruxId, workspace]);
}
