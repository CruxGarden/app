import { getServices } from '@/services';
import type { ToolDefinition } from './adapters/types';

/**
 * Tool definitions — ported from api/src/ai/ai.tools.ts.
 * Same schema, same descriptions. Used by provider adapters.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'write_file',
    description:
      'Create a new file or completely replace an existing file in the workspace. ' +
      'USE WHEN: Creating new files, or rewriting a file where the majority of content changes. ' +
      'DO NOT USE WHEN: Making small targeted edits to existing files — use edit_file instead. ' +
      'PREREQUISITE: If the file already exists, you MUST call read_file first. This tool will ERROR if you overwrite an existing file without reading it first. ' +
      'Prefer edit_file for modifying existing files — it only changes what needs changing. Only use write_file on existing files when changes are so extensive that a full rewrite is simpler. ' +
      'For binary files (images, fonts, PDFs), set encoding to "base64" and provide base64-encoded content.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative file path from workspace root, without leading slash. Use forward slashes. Examples: "src/app.js", "styles/main.css", "index.html".',
        },
        content: {
          type: 'string',
          description:
            'Complete file content. For text files: provide raw text. For binary files (images, fonts, PDFs): provide base64-encoded content and set encoding to "base64".',
        },
        encoding: {
          type: 'string',
          enum: ['utf-8', 'base64'],
          description:
            'Content encoding. Default: "utf-8" for text files. Use "base64" for binary files (png, jpg, woff2, pdf, etc.).',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace a specific string in an existing file with new content. This is the PREFERRED way to modify files — use instead of write_file for targeted changes. ' +
      'PREREQUISITE: You MUST call read_file on this file immediately before calling edit_file. This tool will ERROR if you have not read the file first. ' +
      'The old_string must match EXACTLY one location in the file (including whitespace and indentation), unless replace_all is true. ' +
      'FAILURE MODES: If old_string matches 0 times, the text does not exist — call read_file to check current contents. ' +
      'If old_string matches more than 1 time, either include more surrounding lines to disambiguate, or set replace_all to true. ' +
      'Use replace_all for renaming variables or changing repeated strings across the file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative file path from workspace root, without leading slash. Example: "src/app.js".',
        },
        old_string: {
          type: 'string',
          description:
            'The exact string to find and replace. Must match file content exactly, including whitespace and indentation. Include 2-3 surrounding lines for uniqueness.',
        },
        new_string: {
          type: 'string',
          description:
            'The replacement string. Must be different from old_string. Use empty string to delete the matched text.',
        },
        replace_all: {
          type: 'boolean',
          description:
            'Replace ALL occurrences of old_string in the file. Default: false (requires exactly one match). Set to true when renaming a variable or changing a repeated string.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the workspace. ' +
      'USE BEFORE: Every edit_file call — always read the file first to get its current contents. ' +
      'USE WHEN: You need to inspect file contents before making decisions or edits. ' +
      'RETURNS: Text content for text files, or base64-prefixed content for binary files (images, fonts, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative file path from workspace root, without leading slash. Example: "src/app.js".',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_file',
    description:
      'Request deletion of a file from the workspace. ' +
      'IMPORTANT: This sends a confirmation request to the user — the file is NOT deleted immediately. The user must approve the deletion. ' +
      'Always confirm with the user in your message before calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative file path from workspace root, without leading slash. Example: "src/old-file.js".',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_files',
    description:
      'List all files currently in the workspace with their paths. ' +
      'NOTE: The current file list is already included in your system context at the bottom of this prompt. ' +
      'Only call this tool if you suspect files have changed since the conversation started (e.g., after write_file or delete_file operations in a previous turn).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

/** MIME type map for common file extensions */
const MIME_MAP: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  md: 'text/markdown',
  txt: 'text/plain',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

/** Truncate large tool results to prevent context bloat */
function truncateToolResult(result: string, maxLength = 1500): string {
  if (result.length <= maxLength) return result;
  const headSize = Math.floor(maxLength * 0.6);
  const tailSize = Math.floor(maxLength * 0.3);
  const head = result.slice(0, headSize);
  const tail = result.slice(-tailSize);
  const omitted = result.length - headSize - tailSize;
  return `${head}\n\n…(${omitted} characters omitted — use read_file to see full contents)…\n\n${tail}`;
}

/**
 * Create a tool executor bound to a specific crux.
 * Uses the service layer so tool execution routes to the correct backend.
 *
 * @param cruxId - The crux to operate on
 * @param onDeleteRequest - Callback for delete confirmation (yields to UI)
 */
export function createToolExecutor(
  cruxId: string,
  onDeleteRequest?: (path: string) => Promise<boolean>,
) {
  const { attachment: attachmentService } = getServices();
  const recentlyReadFiles = new Set<string>();

  return async function executeTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    try {
      switch (toolName) {
        case 'write_file': {
          const path = input.path as string;
          const content = input.content as string;
          const encoding = (input.encoding as string) || 'utf-8';

          // Read-before-write enforcement
          const artifacts = await attachmentService.findByResource('crux', cruxId);
          const existing = artifacts.find(
            (a) => (a.meta?.path || a.filename) === path,
          );
          if (existing && !recentlyReadFiles.has(path)) {
            return `File ${path} already exists. Read it first before overwriting, or use edit_file for targeted changes.`;
          }

          if (encoding === 'base64') {
            // Binary content via base64
            const binary = Uint8Array.from(atob(content), (c) =>
              c.charCodeAt(0),
            );
            const blob = new Blob([binary], { type: guessMimeType(path) });
            await attachmentService.upload({
              resourceId: cruxId,
              resourceType: 'crux',
              blob,
              meta: { path },
            });
          } else {
            await attachmentService.create({
              resourceId: cruxId,
              resourceType: 'crux',
              content,
              mimeType: guessMimeType(path),
              meta: { path },
            });
          }
          return `Wrote ${path}`;
        }

        case 'edit_file': {
          const path = input.path as string;
          const oldString = input.old_string as string;
          const newString = input.new_string as string;
          const replaceAll = input.replace_all as boolean | undefined;

          const artifacts = await attachmentService.findByResource('crux', cruxId);
          const match = artifacts.find(
            (a) => (a.meta?.path || a.filename) === path,
          );
          if (!match) return `File not found: ${path}`;
          if (match.encoding === 'binary')
            return `Cannot edit binary file: ${path}`;

          const content = await attachmentService.readContent(match.id);
          const occurrences = content.split(oldString).length - 1;

          if (occurrences === 0) {
            return `old_string not found in ${path}. Call read_file to get the current contents, then retry.`;
          }
          if (occurrences > 1 && !replaceAll) {
            return `Multiple matches (${occurrences}) for old_string in ${path}. Include more context to make it unique, or set replace_all: true.`;
          }

          const newContent = replaceAll
            ? content.replaceAll(oldString, newString)
            : content.replace(oldString, newString);

          await attachmentService.create({
            resourceId: cruxId,
            resourceType: 'crux',
            content: newContent,
            mimeType: match.mimeType,
            meta: { path },
          });
          return `Edited ${path}`;
        }

        case 'read_file': {
          const path = input.path as string;
          recentlyReadFiles.add(path);

          const artifacts = await attachmentService.findByResource('crux', cruxId);
          const match = artifacts.find(
            (a) => (a.meta?.path || a.filename) === path,
          );
          if (!match) return `File not found: ${path}`;

          if (match.encoding === 'binary') {
            const blob = await attachmentService.downloadBlob(match.id);
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(
              String.fromCharCode(...new Uint8Array(buffer)),
            );
            return `base64:${base64}`;
          }

          const content = await attachmentService.readContent(match.id);
          return truncateToolResult(content);
        }

        case 'delete_file': {
          const path = input.path as string;

          if (onDeleteRequest) {
            const confirmed = await onDeleteRequest(path);
            if (!confirmed) return `Delete cancelled by user: ${path}`;
          }

          const artifacts = await attachmentService.findByResource('crux', cruxId);
          const match = artifacts.find(
            (a) => (a.meta?.path || a.filename) === path,
          );
          if (match) {
            await attachmentService.delete(match.id);
          }
          return `Deleted ${path}`;
        }

        case 'list_files': {
          const artifacts = await attachmentService.findByResource('crux', cruxId);
          const files = artifacts
            .filter((a) => a.type === 'artifact')
            .map((a) => a.meta?.path || a.filename);
          return files.join('\n') || 'No files yet.';
        }

        default:
          return `Unknown tool: ${toolName}`;
      }
    } catch (err: any) {
      return `Error executing ${toolName}: ${err.message}`;
    }
  };
}

/** Tool names that mutate files (trigger system prompt refresh) */
export const MUTATING_TOOLS = ['write_file', 'edit_file', 'delete_file'];
