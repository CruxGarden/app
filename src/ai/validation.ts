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
