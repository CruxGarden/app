import { isUnder, normalizePath, resolveRelativePath } from './artifact-path';

/**
 * The file scope a Subagent may write in (AI-COLLABORATION-V3 B5, ADR 0013):
 * an explicit list of paths, a folder, or both. Read tools are never scoped —
 * a worker may look at anything; it may only CHANGE what it was given.
 *
 * A scope with neither paths nor a folder allows no writes at all.
 */
export interface WriteScope {
  /** Exact relative paths the worker may create or change. */
  paths?: string[];
  /** A folder (relative, no trailing slash) the worker may write anywhere under. */
  folder?: string;
}

/** Canonical form of a tool path for scope comparison: no leading slash, no `.`/`..`. */
export function canonicalScopePath(path: string): string {
  return resolveRelativePath(normalizePath(path.trim()));
}

/** Normalize a scope once so comparisons are exact-string. */
export function normalizeScope(scope: WriteScope): WriteScope {
  const paths = (scope.paths ?? []).map(canonicalScopePath).filter(Boolean);
  const folder = scope.folder ? canonicalScopePath(scope.folder) : undefined;
  return {
    ...(paths.length > 0 ? { paths } : {}),
    ...(folder ? { folder } : {}),
  };
}

/** True when `path` may be written under `scope`. */
export function isInScope(path: string, scope: WriteScope): boolean {
  const p = canonicalScopePath(path);
  if (!p) return false;
  const s = normalizeScope(scope);
  if (s.paths?.includes(p)) return true;
  if (s.folder && isUnder(s.folder, p)) return true;
  return false;
}

/** One line that tells a worker what it may touch: "the folder posts/ and the files a.md, b.md". */
export function describeScope(scope: WriteScope): string {
  const s = normalizeScope(scope);
  const parts: string[] = [];
  if (s.folder) parts.push(`the folder ${s.folder}/`);
  if (s.paths?.length) {
    const shown = s.paths.slice(0, 12).join(', ');
    const more = s.paths.length > 12 ? ` and ${s.paths.length - 12} more` : '';
    parts.push(`the file${s.paths.length === 1 ? '' : 's'} ${shown}${more}`);
  }
  return parts.length > 0 ? parts.join(' and ') : 'nothing (read-only)';
}

/** Tools whose inputs name a file they would change; the property holding the path(s). */
const WRITE_PATH_INPUTS: Record<string, string[]> = {
  write_file: ['path'],
  edit_file: ['path'],
  delete_file: ['path'],
  generate_image: ['path'],
  rename_file: ['old_path', 'new_path'],
};

/**
 * The message refusing a write outside the scope, or null when the call is
 * allowed (reads, tools without a path, or paths inside the scope).
 */
export function scopeViolation(
  toolName: string,
  input: Record<string, unknown>,
  scope: WriteScope | undefined,
): string | null {
  if (!scope) return null;
  const keys = WRITE_PATH_INPUTS[toolName];
  if (!keys) return null;
  for (const key of keys) {
    const raw = input[key];
    if (typeof raw !== 'string') continue;
    if (!isInScope(raw, scope)) {
      return `Path "${canonicalScopePath(raw) || raw}" is outside this task's scope — you may only change ${describeScope(scope)}. Leave other files to the main line or another worker.`;
    }
  }
  return null;
}
