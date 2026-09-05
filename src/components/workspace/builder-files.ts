/**
 * Pure helpers behind the Builder's "Add photos" / "Add media" buttons — the
 * bits worth testing without a store: naming files and items so a batch of
 * uploads never lands two records on one path.
 */

import { mediaFileName } from '@/lib/media-kind';
import { slugify, interpolate } from '@/lib/frontmatter';
import { MAX_DELEGATE_TASKS } from '@/ai/delegate-tool';
import type { SubagentTask } from '@/services/subagents';

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

// ── Captions in parallel (B5) ─────────────────────────────────────────────

/** Offer "Write captions" after a photo batch at least this large. */
export const CAPTION_OFFER_MIN = 8;
/** Photos per worker before the batch count grows. */
const CAPTIONS_PER_TASK = 10;

export interface CaptionItem {
  /** The collection item written for the photo. */
  path: string;
  /** The uploaded image's workspace path (what read_file takes). */
  imagePath: string;
}

/**
 * One Subagent task per batch of photos: look at each image, write a
 * one-sentence caption into its post's body. Scope = the posts in the batch,
 * so no two workers ever touch the same file. At most MAX_DELEGATE_TASKS
 * tasks; batches grow past ten when there are more photos than that allows.
 */
export function captionTasksFor(items: CaptionItem[], noun = 'photo'): SubagentTask[] {
  if (items.length === 0) return [];
  const count = Math.min(MAX_DELEGATE_TASKS, Math.max(1, Math.ceil(items.length / CAPTIONS_PER_TASK)));
  const size = Math.ceil(items.length / count);
  const tasks: SubagentTask[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    const end = start + batch.length;
    tasks.push({
      title: `Captions ${start + 1}–${end}`,
      instructions: [
        `Write a caption for each ${noun} below. For each one: call read_file on the image to look at it, call read_file on the post, then use edit_file to replace the post's empty body with one plain sentence describing the ${noun} — specific, no hashtags, no quotes, no title. Keep the frontmatter exactly as it is; only the body changes. If a post already has a body, leave it alone.`,
        '',
        ...batch.map((it) => `- ${it.path} — image: ${it.imagePath}`),
      ].join('\n'),
      scope: { paths: batch.map((it) => it.path) },
    });
  }
  return tasks;
}
