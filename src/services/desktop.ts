/**
 * Typed access to the Electron desktop bridge (config, external URLs).
 * All functions are safe no-ops / nulls on web.
 */

import type { DesktopBridge, DesktopInfo, UpdateState } from '@/lib/platform';
import { getSetting, setSetting } from './settings';
import { SettingsKey } from '@/lib/constants';

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

/** What `openWeb` will hand to a browser: https anywhere, or http on loopback (local API in dev). */
export function isOpenableWebUrl(url: string): boolean {
  return (
    /^https:\/\/\S+$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)
  );
}

/**
 * Open a web URL in the system browser (desktop) or a new tab (web).
 *
 * Resolves `true` when a browser was asked to open it, `false` when it wasn't
 * — a refused URL, a popup blocker, or the desktop shell declining (its IPC
 * handler is https-only, so loopback http never opens there). Callers show
 * the "couldn't open your browser" state on `false`; nothing here throws.
 */
export async function openWeb(url: string): Promise<boolean> {
  if (!isOpenableWebUrl(url)) return false;
  const api = desktopBridge();
  if (api?.openWeb) {
    // The main process only opens https; mirror that so the caller learns
    // about it instead of the click silently doing nothing.
    if (!/^https:\/\//i.test(url)) return false;
    try {
      // The bridge resolves void today; a future contract may report a result.
      const result: unknown = await api.openWeb(url);
      return result === undefined ? true : Boolean(result);
    } catch {
      return false;
    }
  }
  if (typeof window === 'undefined') return false;
  return window.open(url, '_blank', 'noopener') !== null;
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

/**
 * Append text to a file inside the Garden Root, creating it if it is not there
 * yet. The main process refuses anything that resolves outside a known root,
 * so `relPath` is relative by construction. Returns the full path written, or
 * null on web (no filesystem to append to).
 *
 * Read-then-write, not an O_APPEND handle: the bridge only offers whole-file
 * reads and writes, and these files are a few kilobytes of counters.
 */
export async function appendGardenFile(relPath: string, text: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const project = window.electronAPI?.project ?? null;
  const root = await getGardenRoot();
  if (!project || !root) return null;
  let existing = '';
  try {
    existing = new TextDecoder().decode(await project.readFile(root, relPath));
  } catch {
    /* not there yet — the append creates it */
  }
  await project.writeFile(root, relPath, new TextEncoder().encode(existing + text));
  return `${root}/${relPath}`;
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

/**
 * Docked mode: closing the window hides it and the app keeps running from
 * the menu bar, so Schedules keep ticking and Alerts keep collecting. The
 * choice is a Garden setting; the main process is told at boot and on change.
 */
export function isDockedMode(): boolean {
  return getSetting(SettingsKey.DockedMode) === 'true';
}
export async function setDockedMode(on: boolean): Promise<void> {
  setSetting(SettingsKey.DockedMode, String(on));
  await desktopBridge()?.setDocked?.(on);
}
export async function initDockedMode(): Promise<void> {
  if (isDockedMode()) await desktopBridge()?.setDocked?.(true);
}
