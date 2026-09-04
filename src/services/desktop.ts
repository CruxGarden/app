/**
 * Typed access to the Electron desktop bridge (config, external URLs).
 * All functions are safe no-ops / nulls on web.
 */

import type { DesktopBridge, DesktopInfo, UpdateState } from '@/lib/platform';

function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.desktop ?? null;
}

export async function getGardenRoot(): Promise<string | null> {
  const api = desktopBridge();
  if (!api) return null;
  try {
    return (await api.config()).gardenRoot;
  } catch {
    return null;
  }
}

export async function chooseGardenRoot(): Promise<string | null> {
  const api = desktopBridge();
  if (!api) return null;
  return api.chooseGardenRoot();
}

/** Open a local preview URL in the user's default browser. */
export async function openExternal(url: string): Promise<void> {
  await desktopBridge()?.openExternal(url);
}

/** Render a path under the home directory as "~/…" for display (macOS, Linux, Windows). */
export function shortenHomePath(p: string): string {
  const mac = p.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (mac) return `~${mac[1] || ''}`;
  const linux = p.match(/^\/home\/[^/]+(\/.*)?$/);
  if (linux) return `~${linux[1] || ''}`;
  const win = p.match(/^[A-Za-z]:\\Users\\[^\\]+(\\.*)?$/);
  if (win) return `~${(win[1] || '').replace(/\\/g, '/')}`;
  return p;
}

/** Version, platform, log location — null on web. */
export async function getDesktopInfo(): Promise<DesktopInfo | null> {
  const api = desktopBridge();
  if (!api?.info) return null;
  try {
    return await api.info();
  } catch {
    return null;
  }
}

/** Reveal the local log folder in Finder (ADR 0008). */
export async function openLogs(): Promise<void> {
  await desktopBridge()?.openLogs?.();
}

// ── Updates (ADR 0007) ──────────────────────────────────────────────────────

function updatesBridge() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.updates ?? null;
}

export const updates = {
  async state(): Promise<UpdateState | null> {
    const api = updatesBridge();
    if (!api) return null;
    try {
      return await api.state();
    } catch {
      return null;
    }
  },
  check: () => updatesBridge()?.check() ?? Promise.resolve(null),
  download: () => updatesBridge()?.download() ?? Promise.resolve(null),
  install: () => updatesBridge()?.install() ?? Promise.resolve(),
  setAutoCheck: (on: boolean) => updatesBridge()?.setAutoCheck(on) ?? Promise.resolve(null),
  onChange(cb: (s: UpdateState) => void): () => void {
    return updatesBridge()?.onChange(cb) ?? (() => {});
  },
};
