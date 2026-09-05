import { hasSkill, skillNames } from './skills';
import { MEMORY_NOTE_MAX, MEMORY_SECTIONS, normalizeSection } from '@/services/memory';
import { validateDelegateInput } from './delegate-tool';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate tool inputs before execution.
 * Catches malformed calls early with descriptive errors.
 * Ported from api/src/ai/ai.validation.ts.
 */
export function validateToolInput(
  toolName: string,
  input: Record<string, unknown>,
): ValidationResult {
  switch (toolName) {
    case 'write_file':
      return validateWriteFile(input);
    case 'edit_file':
      return validateEditFile(input);
    case 'read_file':
    case 'delete_file':
      return validatePathOnly(input);
    case 'list_files':
    case 'check_site':
    case 'set_theme':
    case 'get_theme':
    case 'set_background':
    case 'get_resonance':
    case 'set_resonance':
      return { valid: true };
    case 'generate_image':
      return validateGenerateImage(input);
    case 'search_files':
      return validateSearchFiles(input);
    case 'rename_file':
      return validateRenameFile(input);
    case 'snapshot':
      return validateOptionalLabel(input);
    case 'list_snapshots':
      return validateListSnapshots(input);
    case 'restore':
      return validateSnapshotRef(input, 'snapshotId', true);
    case 'branch':
      return validateBranch(input);
    case 'diff':
      return validateDiff(input);
    case 'remember':
      return validateRemember(input);
    case 'load_skill':
      return validateLoadSkill(input);
    case 'delegate': {
      const parsed = validateDelegateInput(input);
      return parsed.valid ? { valid: true } : { valid: false, error: parsed.error };
    }
    default:
      return { valid: false, error: `Unknown tool: ${toolName}` };
  }
}

function validateSearchFiles(input: Record<string, unknown>): ValidationResult {
  if (!input.query || typeof input.query !== 'string') {
    return { valid: false, error: 'query is required and must be a string.' };
  }
  if (input.regex !== undefined && typeof input.regex !== 'boolean') {
    return { valid: false, error: 'regex must be a boolean (true or false).' };
  }
  if (input.case_sensitive !== undefined && typeof input.case_sensitive !== 'boolean') {
    return { valid: false, error: 'case_sensitive must be a boolean (true or false).' };
  }
  return { valid: true };
}

function validateRenameFile(input: Record<string, unknown>): ValidationResult {
  if (!input.old_path || typeof input.old_path !== 'string') {
    return { valid: false, error: 'old_path is required and must be a string.' };
  }
  if (!input.new_path || typeof input.new_path !== 'string') {
    return { valid: false, error: 'new_path is required and must be a string.' };
  }
  if (input.old_path === input.new_path) {
    return { valid: false, error: 'old_path and new_path are identical. No rename needed.' };
  }
  const oldIssue = validatePath(input.old_path);
  if (oldIssue) return oldIssue;
  const newIssue = validatePath(input.new_path);
  if (newIssue) return newIssue;
  return { valid: true };
}

function validateWriteFile(input: Record<string, unknown>): ValidationResult {
  if (!input.path || typeof input.path !== 'string') {
    return { valid: false, error: 'path is required and must be a string.' };
  }
  if (input.content === undefined || input.content === null) {
    return { valid: false, error: 'content is required.' };
  }
  if (typeof input.content !== 'string') {
    return { valid: false, error: 'content must be a string.' };
  }

  const pathIssue = validatePath(input.path);
  if (pathIssue) return pathIssue;

  if (input.encoding && !['utf-8', 'base64'].includes(input.encoding as string)) {
    return {
      valid: false,
      error: `Invalid encoding "${input.encoding}". Use "utf-8" for text files or "base64" for binary files.`,
    };
  }

  return { valid: true };
}

function validateEditFile(input: Record<string, unknown>): ValidationResult {
  if (!input.path || typeof input.path !== 'string') {
    return { valid: false, error: 'path is required and must be a string.' };
  }
  if (typeof input.old_string !== 'string' || input.old_string === '') {
    // An empty old_string matches between every character: with replace_all it
    // interleaves the replacement through the whole file and reports success.
    return {
      valid: false,
      error: 'old_string is required and must be a non-empty string.',
    };
  }
  if (typeof input.new_string !== 'string') {
    return {
      valid: false,
      error: 'new_string is required and must be a string.',
    };
  }
  if (input.old_string === input.new_string) {
    return {
      valid: false,
      error: 'old_string and new_string are identical. No change needed.',
    };
  }
  if (input.replace_all !== undefined && typeof input.replace_all !== 'boolean') {
    return {
      valid: false,
      error: 'replace_all must be a boolean (true or false).',
    };
  }

  const pathIssue = validatePath(input.path);
  if (pathIssue) return pathIssue;

  return { valid: true };
}

function validatePathOnly(input: Record<string, unknown>): ValidationResult {
  if (!input.path || typeof input.path !== 'string') {
    return { valid: false, error: 'path is required and must be a string.' };
  }

  const pathIssue = validatePath(input.path as string);
  if (pathIssue) return pathIssue;

  return { valid: true };
}

function validateGenerateImage(input: Record<string, unknown>): ValidationResult {
  if (!input.prompt || typeof input.prompt !== 'string') {
    return { valid: false, error: 'prompt is required and must be a string.' };
  }
  if (!input.path || typeof input.path !== 'string') {
    return { valid: false, error: 'path is required and must be a string.' };
  }
  const pathIssue = validatePath(input.path);
  if (pathIssue) return pathIssue;
  if (input.size && !['1024x1024', '1536x1024', '1024x1536'].includes(input.size as string)) {
    return {
      valid: false,
      error: `Invalid size "${input.size}". Use "1024x1024", "1536x1024", or "1024x1536".`,
    };
  }
  return { valid: true };
}

function validatePath(path: string): ValidationResult | null {
  if (path.startsWith('/')) {
    const suggested = path.slice(1);
    return {
      valid: false,
      error: `Path "${path}" should not start with "/". Use relative paths like "${suggested}".`,
    };
  }
  // Reject traversal segments, not the substring — "notes..md" is a legal name
  if (path.split('/').includes('..')) {
    return {
      valid: false,
      error: 'Path must not contain a ".." segment (directory traversal is not allowed).',
    };
  }
  if (path.includes('\\')) {
    return {
      valid: false,
      error: 'Use forward slashes "/" in paths, not backslashes "\\".',
    };
  }
  return null;
}

// ── Growth tools ────────────────────────────────────────────────────────────

const MAX_LABEL_LENGTH = 120;

function validateOptionalLabel(input: Record<string, unknown>): ValidationResult {
  if (input.label === undefined || input.label === null) return { valid: true };
  if (typeof input.label !== 'string') {
    return { valid: false, error: 'label must be a string.' };
  }
  if (input.label.length > MAX_LABEL_LENGTH) {
    return { valid: false, error: `label must be at most ${MAX_LABEL_LENGTH} characters.` };
  }
  return { valid: true };
}

function validateListSnapshots(input: Record<string, unknown>): ValidationResult {
  if (input.limit === undefined) return { valid: true };
  if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
    return { valid: false, error: 'limit must be a positive integer.' };
  }
  return { valid: true };
}

/** A snapshot reference: id, "#N", or "latest" — resolution happens in the tool. */
function validateSnapshotRef(
  input: Record<string, unknown>,
  key: string,
  required: boolean,
): ValidationResult {
  const value = input[key];
  if (value === undefined || value === null) {
    return required
      ? {
          valid: false,
          error: `${key} is required — a snapshot id from list_snapshots, "#N", or "latest".`,
        }
      : { valid: true };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return {
      valid: false,
      error: `${key} must be a non-empty string (a snapshot id, "#N", or "latest").`,
    };
  }
  return { valid: true };
}

function validateBranch(input: Record<string, unknown>): ValidationResult {
  const ref = validateSnapshotRef(input, 'snapshotId', true);
  if (!ref.valid) return ref;
  if (typeof input.label !== 'string' || input.label.trim() === '') {
    return { valid: false, error: 'label is required and must be a non-empty string.' };
  }
  if (input.label.length > MAX_LABEL_LENGTH) {
    return { valid: false, error: `label must be at most ${MAX_LABEL_LENGTH} characters.` };
  }
  return { valid: true };
}

function validateDiff(input: Record<string, unknown>): ValidationResult {
  const from = validateSnapshotRef(input, 'from', true);
  if (!from.valid) return from;
  return validateSnapshotRef(input, 'to', false);
}

// ── Garden Memory and skills (B6) ───────────────────────────────────────────

function validateRemember(input: Record<string, unknown>): ValidationResult {
  if (typeof input.section !== 'string' || !normalizeSection(input.section)) {
    return {
      valid: false,
      error: `section must be one of ${MEMORY_SECTIONS.map((s) => `"${s}"`).join(', ')}.`,
    };
  }
  if (typeof input.note !== 'string' || input.note.trim() === '') {
    return { valid: false, error: 'note is required and must be a non-empty string.' };
  }
  if (input.note.trim().length > MEMORY_NOTE_MAX) {
    return {
      valid: false,
      error: `note must be at most ${MEMORY_NOTE_MAX} characters — one line, not a paragraph.`,
    };
  }
  if (/\r|\n/.test(input.note.trim())) {
    return { valid: false, error: 'note must be a single line. Call remember once per line.' };
  }
  return { valid: true };
}

function validateLoadSkill(input: Record<string, unknown>): ValidationResult {
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    return { valid: false, error: 'name is required and must be a string.' };
  }
  if (!hasSkill(input.name)) {
    return {
      valid: false,
      error: `Unknown skill "${input.name}". Available: ${skillNames().join(', ')}.`,
    };
  }
  return { valid: true };
}
