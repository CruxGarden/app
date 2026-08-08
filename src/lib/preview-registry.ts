/**
 * Registry of the currently-running local preview per crux (desktop).
 *
 * The preview hooks (static server / astro dev) register their ROOT url here
 * while they're live; snapshot creation reads it to take the "front page"
 * screenshot without needing a reference to the preview iframe.
 */

const active = new Map<string, string>();

export function setActivePreview(cruxId: string, rootUrl: string | null): void {
  if (rootUrl) active.set(cruxId, rootUrl);
  else active.delete(cruxId);
}

export function activePreviewUrl(cruxId: string): string | null {
  return active.get(cruxId) ?? null;
}
