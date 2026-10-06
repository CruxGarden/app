import type { Artifact } from '@/api/types';
import {
  SEARCH_FILE_CHAR_LIMIT,
  SEARCH_TOTAL_CHAR_LIMIT,
  searchFileLines,
} from '@/ai/search-lines';
import { isWorkspaceThumbnail, pathOf } from '@/lib/artifact-path';
import { isBinaryMime } from '@/lib/mime';
import { getServices } from './index';

/**
 * Find in files, for the person. It runs the same line search the
 * collaborator's `search_files` tool runs (`searchFileLines`) over the same
 * files (text Artifacts only), and adds what an editor needs to open a result:
 * where on the line the match sits. It is a plain literal search and depends on
 * no AI setting.
 */
export interface FindMatch {
  /** 1-based line, and 1-based column of the first match on it. */
  line: number;
  column: number;
  length: number;
  /** The line as shown in the results, and where the match sits within it. */
  preview: string;
  previewStart: number;
}

export interface FindFileResult {
  id: string;
  path: string;
  matches: FindMatch[];
}

export interface FindResults {
  files: FindFileResult[];
  /** Matches listed (at most FIND_RESULT_LIMIT). */
  total: number;
  /** There were more matches, or more text, than one search covers. */
  truncated: boolean;
  /** Text files too large to search. */
  skipped: number;
}

export const FIND_RESULT_LIMIT = 200;
const PREVIEW_LENGTH = 200;
const PREVIEW_LEAD = 40;

export const NO_FIND_RESULTS: FindResults = { files: [], total: 0, truncated: false, skipped: 0 };

/** The files `search_files` searches: text Artifacts, never binary content. */
export function searchableArtifacts(artifacts: readonly Artifact[]): Artifact[] {
  return artifacts.filter(
    (a) =>
      a.type === 'artifact' &&
      a.encoding !== 'binary' &&
      !isBinaryMime(a.mimeType || '') &&
      !isWorkspaceThumbnail(pathOf(a)),
  );
}

/** The search's own pattern: the query as literal text. */
function literalPattern(query: string, caseSensitive: boolean): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i');
}

/** Place the first match on a raw line, with a preview that keeps it in sight. */
export function locateMatch(
  rawLine: string,
  lineNumber: number,
  pattern: RegExp,
): FindMatch | null {
  const found = pattern.exec(rawLine);
  if (!found) return null;
  const index = found.index;
  const length = found[0].length;
  const lead = rawLine.length - rawLine.trimStart().length;
  const trimmed = rawLine.trim();
  if (index - lead + length <= PREVIEW_LENGTH)
    return {
      line: lineNumber,
      column: index + 1,
      length,
      preview: trimmed.slice(0, PREVIEW_LENGTH),
      previewStart: Math.max(0, index - lead),
    };
  // A match far along a long line: show the text around it.
  const from = index - PREVIEW_LEAD;
  return {
    line: lineNumber,
    column: index + 1,
    length,
    preview: `…${rawLine.slice(from, from + PREVIEW_LENGTH - 1)}`,
    previewStart: PREVIEW_LEAD + 1,
  };
}

export interface FindInFilesInput {
  artifacts: readonly Artifact[];
  query: string;
  caseSensitive?: boolean;
  /** Abort to abandon a search the person has typed past. */
  signal?: AbortSignal;
  /** Seams for tests; the defaults are the file service and the shared line search. */
  read?: (file: Artifact) => Promise<string>;
  search?: typeof searchFileLines;
}

export async function findInFiles(input: FindInFilesInput): Promise<FindResults> {
  const { query, signal } = input;
  if (!query || query.length > 2048) return NO_FIND_RESULTS;
  const caseSensitive = input.caseSensitive ?? false;
  const read = input.read ?? ((file: Artifact) => getServices().artifact.readContent(file));
  const search = input.search ?? searchFileLines;
  const pattern = literalPattern(query, caseSensitive);
  const results: FindResults = { files: [], total: 0, truncated: false, skipped: 0 };
  let characters = 0;

  const files = searchableArtifacts(input.artifacts).sort((a, b) =>
    pathOf(a).localeCompare(pathOf(b)),
  );
  for (const file of files) {
    signal?.throwIfAborted();
    let content: string;
    try {
      content = await read(file);
    } catch {
      continue; // unreadable file: skip it, as the tool does
    }
    signal?.throwIfAborted();
    if (content.length > SEARCH_FILE_CHAR_LIMIT) {
      results.skipped++;
      continue;
    }
    characters += content.length;
    if (characters > SEARCH_TOTAL_CHAR_LIMIT) {
      results.truncated = true;
      break;
    }
    // Most files hold no match; only the ones that do are worth a search worker.
    if (!pattern.test(content)) continue;
    let found: Awaited<ReturnType<typeof searchFileLines>>;
    try {
      found = await search({
        content,
        query,
        regex: false,
        caseSensitive,
        limit: FIND_RESULT_LIMIT + 1 - results.total,
      });
    } catch {
      results.skipped++;
      continue;
    }
    signal?.throwIfAborted();
    const lines = content.split('\n');
    const matches: FindMatch[] = [];
    for (const hit of found) {
      if (results.total === FIND_RESULT_LIMIT) {
        results.truncated = true;
        break;
      }
      const match = locateMatch(lines[hit.line - 1] ?? '', hit.line, pattern);
      if (!match) continue;
      matches.push(match);
      results.total++;
    }
    if (matches.length) results.files.push({ id: file.id, path: pathOf(file) || file.id, matches });
    if (results.truncated) break;
  }
  return results;
}
