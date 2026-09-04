/**
 * Pure helpers behind the Builder's "Add photos" / "Add media" buttons — the
 * bits worth testing without a store: naming files and items so a batch of
 * uploads never lands two records on one path.
 */

import { mediaFileName } from '@/lib/media-kind';
import { slugify, interpolate } from '@/lib/frontmatter';

/**
 * Transcoding reads the whole file into memory and ships it across IPC as one
 * message. Beyond this the renderer stalls or the IPC channel gives up, so we
 * refuse with a clear message instead. Streaming is a later change.
 */
export const MAX_TRANSCODE_BYTES = 500 * 1024 * 1024;

/** "IMG_0001.jpg" → "IMG 0001"; "wet-leaves.png" → "wet leaves". */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

/** Split "a.b.jpg" into ["a.b", ".jpg"]; ".jpg" is all extension; "name" has none. */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}

/**
 * The public filename for an upload, unique against `taken` (names already in
 * the target folder plus earlier files in this batch). Sanitises, then adds
 * `-2`, `-3`… before the extension; an all-dropped name becomes "file".
 */
export function uniqueFileName(original: string, taken: Set<string>): string {
  let name = mediaFileName(original);
  const [rawStem, ext] = splitExt(name);
  let stem = rawStem;
  if (!stem) {
    // Every character was dropped (non-Latin name) — keep the extension, name it.
    stem = 'file';
    name = stem + ext;
  }
  let n = 2;
  while (taken.has(name)) name = `${stem}-${n++}${ext}`;
  return name;
}

export interface ItemVars {
  slug: string;
  title: string;
  today: string;
}

/**
 * Resolve where a new collection item lands: slugify the title, then bump the
 * slug (`-2`, `-3`…) until the interpolated path is free of `takenPaths`.
 * Non-Latin titles all slugify to "untitled", so this is what keeps a second
 * photo from overwriting the first.
 */
export function uniqueItemPath(
  pathTemplate: string,
  title: string,
  takenPaths: Set<string>,
  today = new Date().toISOString().slice(0, 10),
): { path: string; vars: ItemVars } {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  let vars: ItemVars = { slug, title, today };
  let path = interpolate(pathTemplate, vars);
  while (takenPaths.has(path)) {
    slug = `${base}-${n++}`;
    vars = { slug, title, today };
    path = interpolate(pathTemplate, vars);
  }
  return { path, vars };
}

/** Summary line for a batch: "Added 2 posts" + optional failures/skips. */
export function describeBatch(opts: {
  added: number;
  singular: string;
  plural?: string;
  converted?: number;
  skipped?: number;
  failed?: string[];
}): string {
  const noun = opts.added === 1 ? opts.singular : (opts.plural ?? `${opts.singular}s`);
  let text = `Added ${opts.added} ${noun}`;
  if (opts.converted) text += ` (${opts.converted} converted for the web)`;
  if (opts.skipped)
    text += `; skipped ${opts.skipped} non-media file${opts.skipped === 1 ? '' : 's'}`;
  text += '.';
  if (opts.failed?.length) {
    text += `\n\nCouldn't add ${opts.failed.length} file${opts.failed.length === 1 ? '' : 's'}:\n${opts.failed.join('\n')}`;
  }
  return text;
}
