import { useEffect, useMemo, useState } from 'react';
import { isSiteCrux, startDevServer, stopDevServer, devServerLeases } from '@/services/site';
import { Capability, can } from '@/lib/platform';
import { useCruxStore } from '@/stores/cruxStore';
import { normalizePath } from '@/lib/rewriteUrls';
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

    startDevServer(cruxId)
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

  const url = base && phase === 'ready' ? `${base}${siteRouteFor(filePath)}` : null;
  return { isSite, url, phase, detail };
}
