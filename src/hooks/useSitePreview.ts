import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isSiteCrux,
  startDevServer,
  stopDevServer,
  restartDevServer,
  devServerLeases,
} from '@/services/site';
import { Capability, can } from '@/lib/platform';
import { useCruxStore } from '@/stores/cruxStore';
import { resolveRelativePath as normalizePath } from '@/lib/artifact-path';
import { setActivePreview } from '@/lib/preview-registry';

export type SitePreviewPhase = 'idle' | 'installing' | 'starting' | 'ready' | 'error';

export interface SitePreview {
  /** Whether the open crux is a Site Crux runnable on this platform. */
  isSite: boolean;
  /** Dev-server URL for the current file's route (null until ready). */
  url: string | null;
  phase: SitePreviewPhase;
  /** Latest toolchain/dev-server output line, or the error message. */
  detail: string;
  /** Port the dev server is listening on (null until ready). */
  port: number | null;
  /** The port the crux asks for (settings.previewPort), if any. */
  preferredPort: number | null;
  /** Stop and start the dev server again; with a port, remember it for this crux first. */
  restart: (port?: number | null) => Promise<void>;
}

/** Port of a http://127.0.0.1:NNNN base URL, or null. */
export function portOf(base: string | null): number | null {
  if (!base) return null;
  const m = /:(\d+)\/?$/.exec(base);
  return m ? Number(m[1]) : null;
}

/** Map a source file to its dev-server route (Astro pages convention). */
export function siteRouteFor(filePath: string): string {
  const norm = normalizePath(filePath);
  const match = norm.match(/^src\/pages\/(.+)$/);
  if (!match) return '/';
  let route = match[1]!.replace(/\.(astro|md|mdx|html)$/, '');
  if (route === 'index' || route.endsWith('/index')) route = route.slice(0, -'index'.length);
  return '/' + route.replace(/\/$/, '');
}

/**
 * Dev-server preview for Site Cruxes (ADR 0005): `astro dev` on the crux's
 * own port. Install runs on first use; HMR handles reloads (no version
 * bumping).
 *
 * The server lives as long as the CRUX is open, not as long as a previewable
 * tab is focused: lifecycle is driven by `isSite` alone, and the service layer
 * leases the server so multiple editor tabs share one. Opening a CSS or config
 * file no longer tears `astro dev` down. What the pane actually renders is
 * decided downstream by `previewFor`.
 */
export function useSitePreview(cruxId: string, filePath: string): SitePreview {
  const artifacts = useCruxStore((s) => s.artifacts);
  const preferredPort = useCruxStore((s) => s.crux?.meta?.settings?.previewPort ?? null);
  // The start effect reads the preference through a ref on purpose: changing
  // the port must not tear the server down and up by itself — restart() does
  // that deliberately, once, when the user asks.
  const preferredRef = useRef(preferredPort);
  preferredRef.current = preferredPort;
  const isSite = useMemo(() => can(Capability.Build) && isSiteCrux(artifacts), [artifacts]);

  const [base, setBase] = useState<string | null>(null);
  const [phase, setPhase] = useState<SitePreviewPhase>('idle');
  const [detail, setDetail] = useState('');

  const active = isSite;

  // Surface toolchain output (pnpm install progress) while starting
  useEffect(() => {
    if (!active || base) return;
    const api = window.electronAPI?.toolchain;
    if (!api?.onOutput) return;
    return api.onOutput(({ line }) => setDetail(line));
  }, [active, base]);

  // Dev-server lifecycle — per open crux
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    setPhase('installing');
    setDetail('Preparing project…');

    const wanted = preferredRef.current;
    startDevServer(cruxId, wanted ? { port: wanted } : {})
      .then((url) => {
        if (cancelled || !url) return;
        setBase(url);
        setPhase('ready');
        setDetail('');
        setActivePreview(cruxId, `${url}/`); // front page — snapshot screenshots
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase('error');
        setDetail(err?.message || 'Dev server failed to start');
      });

    return () => {
      cancelled = true;
      setBase(null);
      setPhase('idle');
      // Release synchronously, then deregister the capture URL only if no
      // other tab still holds the server (a tab switch keeps it registered).
      stopDevServer(cruxId).catch(() => {});
      if (devServerLeases.count(cruxId) === 0) setActivePreview(cruxId, null);
    };
  }, [cruxId, active]);

  const restart = useCallback(
    async (port?: number | null) => {
      if (port !== undefined) {
        // Remember the choice on the crux (null clears it), then restart on it.
        const { crux, updateCrux } = useCruxStore.getState();
        if (crux) {
          const settings = { ...(crux.meta?.settings ?? {}) };
          if (port) settings.previewPort = port;
          else delete settings.previewPort;
          await updateCrux({ meta: { ...(crux.meta ?? {}), settings } });
        }
      }
      setPhase('starting');
      setDetail('Restarting dev server…');
      setBase(null);
      try {
        const wanted = port === undefined ? preferredPort : port;
        const url = await restartDevServer(cruxId, wanted ? { port: wanted } : {});
        if (!url) return;
        setBase(url);
        setPhase('ready');
        setDetail('');
        setActivePreview(cruxId, `${url}/`);
      } catch (err) {
        setPhase('error');
        setDetail((err as Error)?.message || 'Dev server failed to restart');
      }
    },
    [cruxId, preferredPort],
  );

  const url = base && phase === 'ready' ? `${base}${siteRouteFor(filePath)}` : null;
  return { isSite, url, phase, detail, port: portOf(base), preferredPort, restart };
}
