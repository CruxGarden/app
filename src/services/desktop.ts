/**
 * Typed access to the Electron desktop bridge (config, external URLs).
 * All functions are safe no-ops / nulls on web.
 */

interface DesktopBridge {
  config(): Promise<{ gardenRoot: string }>;
  chooseGardenRoot(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
}

function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { electronAPI?: { desktop?: DesktopBridge } }).electronAPI?.desktop ??
    null
  );
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

/** Render "/Users/name/…" as "~/…" for display. */
export function shortenHomePath(p: string): string {
  const match = p.match(/^\/Users\/[^/]+(\/.*)?$/);
  return match ? `~${match[1] || ''}` : p;
}
