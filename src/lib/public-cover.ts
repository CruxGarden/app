import { publishBaseUrlFor } from './public-url';

/**
 * Where a published crux's cover lives: the publish pipeline ships the
 * workspace thumbnail (preview.jpg) as `_crux/cover.jpg` next to the site.
 * Older publishes have none — callers hide the image on error.
 */
export const PUBLIC_COVER_PATH = '_crux/cover.jpg';

export function publicCoverUrl(cruxId: string): string {
  return `${publishBaseUrlFor(cruxId)}/${PUBLIC_COVER_PATH}`;
}
