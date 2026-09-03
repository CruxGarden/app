import { getServices } from '@/services';
import type { ToolResultContent } from '@/services/types';
import { validateToolInput } from './validation';
import { formatToolError } from './errors';
import { guessMimeType, isBinaryMime, isImageMime } from '@/lib/mime';
import { checkSiteBuild, SiteBuildError } from '@/services/site';
import { Capability, can } from '@/lib/platform';
import { pathOf, type ArtifactPathSource } from '@/lib/artifact-path';
import { THEME_TOOL_DEFINITIONS, runThemeTool } from './theme-tools';

/**
 * Tool definitions — ported from api/src/ai/ai.tools.ts.
 * Same schema, same descriptions. Used by provider adapters.
 */
/** Tool definition (Anthropic-style JSON schema; converted per-provider by the engine) */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
}

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
      'IMPORTANT: This shows the user a confirmation prompt and WAITS for their decision — the tool result tells you whether they approved (file deleted) or declined (file still exists). ' +
      'Trust the result: never assume a file is gone unless the result says it was deleted.',
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
  {
    name: 'generate_image',
    description:
      'Generate an image using AI and save it to the workspace as a file. ' +
      'USE WHEN: The user asks you to create, generate, or design an image, icon, illustration, logo, photo, or graphic. ' +
      'This calls an image generation model and saves the result as a PNG file in the workspace. ' +
      'Provide a detailed, descriptive prompt for best results. The image is saved at the specified path.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed description of the image to generate. Be specific about style, composition, colors, and content.',
        },
        path: {
          type: 'string',
          description:
            'File path to save the generated image. Should end in .png. Example: "images/hero.png", "logo.png".',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536'],
          description:
            'Image dimensions. Default: "1024x1024". Use "1536x1024" for landscape, "1024x1536" for portrait.',
        },
      },
      required: ['prompt', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_files',
    description:
      'Search every text file in the workspace and return matching lines as "path:line: text". ' +
      'USE WHEN: You need to find where something is defined, used, or mentioned without reading every file — much cheaper than multiple read_file calls. ' +
      'The query is a plain case-insensitive substring by default; set regex: true for a JavaScript regular expression.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Text to search for. A literal substring unless regex is true. Example: "PostLayout" or (with regex) "date:\\\\s*2026".',
        },
        regex: {
          type: 'boolean',
          description:
            'Treat query as a JavaScript regular expression. Default: false (literal substring).',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Match case exactly. Default: false.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_file',
    description:
      'Rename or move a file within the workspace. Content and history are preserved. ' +
      'USE WHEN: The user wants a file renamed or moved to another directory. ' +
      'DO NOT: recreate a file at a new path with write_file and delete the old one — use this tool instead. ' +
      'NOTE: References to the old path in other files are NOT updated — check with search_files and fix them with edit_file.',
    input_schema: {
      type: 'object',
      properties: {
        old_path: {
          type: 'string',
          description: 'Current relative path of the file. Example: "posts/draft.md".',
        },
        new_path: {
          type: 'string',
          description: 'New relative path. Example: "posts/hello-world.md".',
        },
      },
      required: ['old_path', 'new_path'],
      additionalProperties: false,
    },
  },
];

/**
 * Site Crux tools — only offered when the platform can run builds
 * (desktop, Capability.Build). Kept out of TOOL_DEFINITIONS so web
 * conversations never see tools that would always fail.
 */
export const SITE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'check_site',
    description:
      "Run the site's production build to verify it compiles (Site Cruxes with a build step). " +
      'Returns the build log on failure so you can fix the errors, then run it again. Nothing is published — this only verifies. ' +
      'USE WHEN: After changes that could break the build (config, layouts, frontmatter, dependencies), or when the user reports the preview or publish failing.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

/** The tool set to offer a workspace conversation on this platform. */
export function defaultToolDefinitions(): ToolDefinition[] {
  const site = can(Capability.Build) ? SITE_TOOL_DEFINITIONS : [];
  return [...TOOL_DEFINITIONS, ...site, ...THEME_TOOL_DEFINITIONS];
}

/**
 * Create a tool executor bound to a specific crux.
 * Uses the service layer so tool execution routes to the correct backend.
 *
 * Ported from api/src/ai/ai.service.ts — includes:
 * - Input validation (validateToolInput)
 * - Error formatting with recovery guidance (formatToolError)
 * - Line ending normalization for edit_file
 * - Whitespace-trim fallback for edit_file
 * - File preview on edit failure
 * - Stale-read clearing after mutations
 * - Read-before-edit/write enforcement
 *
 * @param cruxId - The crux to operate on
 * @param onDeleteRequest - Delete-approval callback. Shows the user a
 *   confirmation and resolves with their decision; when it resolves true the
 *   APP has already deleted the file (the executor only reports it). Omit for
 *   headless use — the executor then deletes directly.
 */
export function createToolExecutor(
  cruxId: string,
  onDeleteRequest?: (path: string, artifactId: string) => Promise<boolean>,
  chatModel?: string,
) {
  const { artifact: artifactService } = getServices();
  const recentlyReadFiles = new Set<string>();

  // The SDK executes a step's tool calls concurrently (Promise.all). Nothing
  // in here is safe under that: the read-tracking set is shared, and the
  // service's check-then-insert dedup would interleave into duplicate rows for
  // two writes to the same path. Serialize — tool calls are IO-bound on one
  // SQLite connection anyway, so there is no parallelism to lose.
  let queue: Promise<unknown> = Promise.resolve();

  async function runTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<string | ToolResultContent> {
    // Validate inputs before execution
    const validation = validateToolInput(toolName, input);
    if (!validation.valid) {
      return formatToolError(toolName, validation.error!);
    }

    const normPath = normalizeToolPath(input.path as string | undefined);

    // Track read_file calls for read-before-edit enforcement
    if (toolName === 'read_file' && normPath) {
      recentlyReadFiles.add(normPath);
    }

    const hasBeenRead = !!normPath && recentlyReadFiles.has(normPath);

    if (toolName === 'edit_file' && normPath && !hasBeenRead) {
      return formatToolError(
        'edit_file',
        `You must call read_file on "${normPath}" before editing it. Read the file first to get its current contents, then retry.`,
      );
    }

    // Hard-enforce read-before-write for existing files
    if (toolName === 'write_file' && normPath && !hasBeenRead) {
      const artifacts = await artifactService.findByResource('crux', cruxId);
      if (findArtifactByPath(artifacts, normPath)) {
        return formatToolError(
          'write_file',
          `File "${normPath}" already exists. You must call read_file before overwriting an existing file. Read it first, then use edit_file for targeted changes or write_file for a full rewrite.`,
        );
      }
    }

    try {
      let result: string | ToolResultContent;

      switch (toolName) {
        case 'write_file':
          result = await toolWriteFile(input, cruxId, artifactService);
          break;
        case 'edit_file':
          result = await toolEditFile(input, cruxId, artifactService);
          break;
        case 'read_file':
          result = await toolReadFile(input, cruxId, artifactService);
          break;
        case 'delete_file':
          result = await toolDeleteFile(input, cruxId, artifactService, onDeleteRequest);
          break;
        case 'list_files':
          result = await toolListFiles(cruxId, artifactService);
          break;
        case 'generate_image':
          result = await toolGenerateImage(input, cruxId, artifactService, chatModel);
          break;
        case 'search_files':
          result = await toolSearchFiles(input, cruxId, artifactService);
          break;
        case 'rename_file':
          result = await toolRenameFile(input, cruxId, artifactService);
          break;
        case 'check_site':
          result = await toolCheckSite(cruxId);
          break;
        case 'set_theme':
        case 'get_theme':
        case 'set_background':
          result = await runThemeTool(toolName, input, { cruxId, chatModel });
          break;
        default:
          return formatToolError(toolName, `Unknown tool: ${toolName}`);
      }

      // A file whose content actually changed is no longer "read" — but a
      // FAILED edit changed nothing, and its error deliberately embeds the
      // current contents so the model can retry without re-reading. Clearing
      // on failure made that retry impossible.
      if (didMutate(toolName, result)) {
        if (normPath) recentlyReadFiles.delete(normPath);
        if (toolName === 'rename_file') {
          recentlyReadFiles.delete(normalizeToolPath(input.old_path as string)!);
          recentlyReadFiles.delete(normalizeToolPath(input.new_path as string)!);
        }
      }

      return result;
    } catch (err: unknown) {
      return formatToolError(toolName, err as Error);
    }
  }

  return function executeTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<string | ToolResultContent> {
    const run = queue.then(
      () => runTool(toolName, input),
      () => runTool(toolName, input),
    );
    queue = run.catch(() => {});
    return run;
  };
}

/** Canonical relative path for a tool input ('' and undefined → undefined). */
function normalizeToolPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.replace(/^\//, '') || undefined;
}

/** Prefix of the delete_file result when the user refused. */
export const DELETE_DECLINED = 'The user DECLINED';

/**
 * Did this tool call actually change the workspace?
 *
 * The single source of truth for "was this a mutation" — used by the engine
 * (workspace-context refresh, `hadMutation`) and by the chat hook (artifact
 * refresh, auto-snapshot). Both previously kept their own tool-name lists,
 * which drifted: `rename_file` was missing from the hook's copies, so an AI
 * rename never refreshed the file tree.
 *
 * Name alone isn't enough: a blocked edit, a validation error, or a declined
 * delete are all non-events, and treating them as mutations caused pointless
 * prompt rebuilds and spurious snapshots.
 */
export function didMutate(toolName: string, result: string | ToolResultContent): boolean {
  if (!MUTATING_TOOLS.includes(toolName)) return false;
  // Mutating tools always report as plain strings we author ourselves
  if (typeof result !== 'string') return false;
  if (result.startsWith('Error')) return false;
  if (result.startsWith(DELETE_DECLINED)) return false;
  return true;
}

// ── Tool implementations ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- service layer type
type ArtifactService = any;

async function toolWriteFile(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
): Promise<string> {
  const path = input.path as string;
  const content = input.content as string;
  const encoding = (input.encoding as string) || 'utf-8';

  // Check if file already exists (for response message)
  const artifacts = await artifactService.findByResource('crux', cruxId);
  const existing = findArtifactByPath(artifacts, path);

  if (encoding === 'base64') {
    const binary = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: guessMimeType(path) });
    await artifactService.upload({
      resourceId: cruxId,
      resourceType: 'crux',
      blob,
      meta: { path },
    });
  } else {
    await artifactService.create({
      resourceId: cruxId,
      resourceType: 'crux',
      content,
      mimeType: guessMimeType(path),
      meta: { path },
    });
  }
  return existing ? `Updated file: ${path}` : `Created file: ${path}`;
}

async function toolEditFile(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
): Promise<string> {
  const path = input.path as string;
  const oldString = input.old_string as string;
  const newString = input.new_string as string;
  const replaceAll = (input.replace_all as boolean) ?? false;

  const artifacts = await artifactService.findByResource('crux', cruxId);
  const match = findArtifactByPath(artifacts, path);
  if (!match) return formatToolError('edit_file', `File not found: ${path}`);
  if (isBinaryMime(match.mimeType || ''))
    return formatToolError('edit_file', `Cannot edit binary file: ${path}`);

  const rawContent = await artifactService.readContent(match.id);

  // Normalize line endings to \n for reliable matching (matches API behavior)
  const content = rawContent.replace(/\r\n/g, '\n');
  const normalizedOld = oldString.replace(/\r\n/g, '\n');

  let matchCount = content.split(normalizedOld).length - 1;

  // Fallback: try with trailing whitespace trimmed per line (matches API behavior)
  let effectiveOld = normalizedOld;
  if (matchCount === 0) {
    const trimmedOld = normalizedOld
      .split('\n')
      .map((line: string) => line.trimEnd())
      .join('\n');
    const trimmedContent = content
      .split('\n')
      .map((line: string) => line.trimEnd())
      .join('\n');
    const trimmedCount = trimmedContent.split(trimmedOld).length - 1;
    if (trimmedCount === 1) {
      // Find the actual substring in the original content by matching line-by-line
      const oldLines = trimmedOld.split('\n');
      const contentLines = content.split('\n');
      for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
        const slice = contentLines.slice(i, i + oldLines.length);
        const sliceTrimmed = slice.map((l: string) => l.trimEnd()).join('\n');
        if (sliceTrimmed === trimmedOld) {
          effectiveOld = slice.join('\n');
          matchCount = 1;
          break;
        }
      }
    }
  }

  if (matchCount === 0) {
    // Include a snippet of the actual file so the model can retry without another read_file
    const preview =
      content.length <= 800 ? content : content.slice(0, 400) + '\n…\n' + content.slice(-400);
    return (
      formatToolError('edit_file', `old_string not found in ${path}`) +
      `\n\nCurrent file contents:\n\`\`\`\n${preview}\n\`\`\``
    );
  }
  if (matchCount > 1 && !replaceAll) {
    return formatToolError(
      'edit_file',
      `old_string matches ${matchCount} locations in ${path}. Either include more surrounding context to make it unique, or set replace_all to true.`,
    );
  }

  // Use a replacer function to avoid $ pattern interpretation in newString
  const normalizedNew = newString.replace(/\r\n/g, '\n');
  let updatedContent: string;
  if (replaceAll) {
    updatedContent = content.split(effectiveOld).join(normalizedNew);
  } else {
    updatedContent = content.replace(effectiveOld, () => normalizedNew);
  }

  await artifactService.create({
    resourceId: cruxId,
    resourceType: 'crux',
    content: updatedContent,
    mimeType: match.mimeType,
    meta: { path },
  });

  if (replaceAll && matchCount > 1) {
    return `Edited file: ${path} (replaced ${matchCount} occurrences)`;
  }
  return `Edited file: ${path}`;
}

/** Base64-encode bytes in chunks — `String.fromCharCode(...bytes)` blows the stack on large files. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function extractPdfText(blob: Blob): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  // Use fake worker to avoid separate worker file
  GlobalWorkerOptions.workerSrc = '';
  const buffer = await blob.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ');
    if (text.trim()) pages.push(`--- Page ${i} ---\n${text}`);
  }
  return pages.join('\n\n');
}

async function extractDocxText(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await blob.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function toolReadFile(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
): Promise<string | ToolResultContent> {
  const path = input.path as string;

  const artifacts = await artifactService.findByResource('crux', cruxId);
  const match = findArtifactByPath(artifacts, path);
  if (!match) return formatToolError('read_file', `File not found: ${path}`);

  if (match.encoding === 'binary' || isBinaryMime(match.mimeType || '')) {
    const blob = await artifactService.downloadBlob(match.id);
    const mime = match.mimeType || '';

    // Extract text from PDFs
    if (mime === 'application/pdf' || path.endsWith('.pdf')) {
      try {
        const text = await extractPdfText(blob);
        if (text.trim()) {
          return `[Extracted text from PDF: ${path}]\n\n${text}`;
        }
        return `[PDF file: ${path} — no extractable text (may be scanned/image-based)]`;
      } catch {
        return `[PDF file: ${path} — text extraction failed. Binary file, ${blob.size} bytes]`;
      }
    }

    // Extract text from DOCX
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      path.endsWith('.docx')
    ) {
      try {
        const text = await extractDocxText(blob);
        if (text.trim()) {
          return `[Extracted text from DOCX: ${path}]\n\n${text}`;
        }
        return `[DOCX file: ${path} — no extractable text]`;
      } catch {
        return `[DOCX file: ${path} — text extraction failed. Binary file, ${blob.size} bytes]`;
      }
    }

    // Images — return as image content block so the AI can see them
    if (isImageMime(mime)) {
      const buffer = await blob.arrayBuffer();
      const base64 = bytesToBase64(new Uint8Array(buffer));
      return [
        { type: 'text', text: `[Image: ${path} (${mime}, ${buffer.byteLength} bytes)]` },
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
      ];
    }

    // Other binary files — return base64 (chunked; spreading the byte array
    // into fromCharCode overflows the call stack past ~100KB)
    const buffer = await blob.arrayBuffer();
    return `[Binary file: ${path} (${mime}, ${buffer.byteLength} bytes)] base64:${bytesToBase64(
      new Uint8Array(buffer),
    )}`;
  }

  // Return full content — no truncation (matches API behavior)
  const content = await artifactService.readContent(match.id);
  return content;
}

async function toolDeleteFile(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
  onDeleteRequest?: (path: string, artifactId: string) => Promise<boolean>,
): Promise<string> {
  const path = input.path as string;

  const artifacts = await artifactService.findByResource('crux', cruxId);
  const match = findArtifactByPath(artifacts, path);
  if (!match) return formatToolError('delete_file', `File not found: ${path}`);

  // Honest approval: block until the user decides; the app performs the
  // deletion on approval, so the result always reflects what actually happened.
  // Report the artifact's real path, which may differ from what was asked for
  // when the model used a bare filename.
  const realPath = pathOf(match) || path;

  if (onDeleteRequest) {
    const approved = await onDeleteRequest(realPath, match.id);
    if (!approved) {
      return `${DELETE_DECLINED} the deletion of ${realPath}. The file still exists — do not retry unless asked again.`;
    }
    return `Deleted file: ${realPath} (approved by user)`;
  }

  await artifactService.delete(match.id);
  return `Deleted file: ${realPath}`;
}

const MAX_SEARCH_MATCHES = 100;

async function toolSearchFiles(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
): Promise<string> {
  const query = input.query as string;
  const useRegex = (input.regex as boolean) ?? false;
  const caseSensitive = (input.case_sensitive as boolean) ?? false;

  let pattern: RegExp;
  try {
    const source = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(source, caseSensitive ? '' : 'i');
  } catch (err: unknown) {
    return formatToolError('search_files', `Invalid regular expression: ${(err as Error).message}`);
  }

  const artifacts = await artifactService.findByResource('crux', cruxId);
  const files = artifacts.filter(
    (a: { type: string; mimeType?: string; encoding?: string }) =>
      a.type === 'artifact' && a.encoding !== 'binary' && !isBinaryMime(a.mimeType || ''),
  );

  const matches: string[] = [];
  let truncated = false;
  for (const file of files) {
    const path = file.meta?.path || file.filename;
    let content: string;
    try {
      content = await artifactService.readContent(file.id);
    } catch {
      continue; // unreadable file — skip, don't fail the whole search
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i]!)) {
        if (matches.length >= MAX_SEARCH_MATCHES) {
          truncated = true;
          break;
        }
        matches.push(`${path}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
      }
    }
    if (truncated) break;
  }

  if (matches.length === 0) return `No matches for "${query}" in ${files.length} text file(s).`;
  return (
    matches.join('\n') +
    (truncated ? `\n… stopped at ${MAX_SEARCH_MATCHES} matches — narrow the query.` : '')
  );
}

async function toolRenameFile(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
): Promise<string> {
  const oldPath = input.old_path as string;
  const newPath = (input.new_path as string).replace(/^\//, '');

  const artifacts = await artifactService.findByResource('crux', cruxId);
  const match = findArtifactByPath(artifacts, oldPath);
  if (!match) return formatToolError('rename_file', `File not found: ${oldPath}`);

  const collision = findArtifactByPath(artifacts, newPath);
  if (collision && collision.id !== match.id) {
    return formatToolError(
      'rename_file',
      `A file already exists at ${newPath}. Delete or rename it first.`,
    );
  }

  // The artifact service owns the rest: meta.path + path column + filename
  // sync, and the Project Folder rename on desktop.
  await artifactService.update(match.id, { meta: { path: newPath } });
  return `Renamed ${oldPath} → ${newPath}. References to the old path in other files are NOT updated automatically.`;
}

async function toolCheckSite(cruxId: string): Promise<string> {
  try {
    const outcome = await checkSiteBuild(cruxId);
    if (outcome === null) {
      return formatToolError(
        'check_site',
        'Building is not available here — it requires the desktop app with a Project Folder for this crux.',
      );
    }
    if (outcome.ok) return 'Build passed — the site compiles cleanly.';
    return `Build FAILED. Fix the errors below, then run check_site again to verify:\n\n${tailOf(outcome.log)}`;
  } catch (err: unknown) {
    if (err instanceof SiteBuildError) {
      return `Build FAILED (${err.message}):\n\n${tailOf(err.log)}`;
    }
    return formatToolError('check_site', err as Error);
  }
}

/** Last portion of a build log — errors are at the end; keep the result cheap. */
function tailOf(log: string, maxChars = 4000): string {
  const trimmed = log.trim();
  return trimmed.length <= maxChars ? trimmed : '…' + trimmed.slice(-maxChars);
}

async function toolListFiles(cruxId: string, artifactService: ArtifactService): Promise<string> {
  const artifacts = await artifactService.findByResource('crux', cruxId);
  const files = artifacts
    .filter((a: { type: string }) => a.type === 'artifact')
    .map((a: { meta?: { path?: string }; filename: string }) => a.meta?.path || a.filename);
  return files.join('\n') || 'No files yet.';
}

async function toolGenerateImage(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
  chatModel?: string,
): Promise<string> {
  const prompt = input.prompt as string;
  const path = input.path as string;
  const size = (input.size as string) || '1024x1024';

  if (!prompt) return formatToolError('generate_image', 'prompt is required');
  if (!path) return formatToolError('generate_image', 'path is required');

  const generated = await generateImageBlob(prompt, size, chatModel);
  if ('error' in generated) return formatToolError('generate_image', generated.error);

  await artifactService.upload({
    resourceId: cruxId,
    resourceType: 'crux',
    blob: generated.blob,
    meta: { path },
  });

  return `Generated and saved image: ${path}`;
}

/**
 * Generate an image with whichever configured provider can (the chat's
 * provider first, then any other with an Images capability). Shared by
 * generate_image (saves to the workspace) and set_background (the Mood).
 */
export async function generateImageBlob(
  prompt: string,
  size = '1024x1024',
  chatModel?: string,
): Promise<{ blob: Blob; provider: string } | { error: string }> {
  const { getApiKey } = await import('./keys');
  const { getProviderForModel } = await import('./providers');
  const { PROVIDERS } = await import('./providers');

  const chatProvider = chatModel ? getProviderForModel(chatModel) : null;
  const chatProviderInfo = chatProvider ? PROVIDERS[chatProvider] : null;
  const chatSupportsImages = chatProviderInfo?.capabilities.includes('Images');

  let imageProvider: string | null = null;
  let imageApiKey: string | null = null;

  if (chatSupportsImages && chatProvider) {
    const key = await getApiKey(chatProvider);
    if (key) {
      imageProvider = chatProvider;
      imageApiKey = key;
    }
  }
  if (!imageApiKey) {
    for (const [id, info] of Object.entries(PROVIDERS)) {
      if (info.capabilities.includes('Images')) {
        const key = await getApiKey(id);
        if (key) {
          imageProvider = id;
          imageApiKey = key;
          break;
        }
      }
    }
  }
  if (!imageApiKey || !imageProvider) {
    return {
      error:
        'No API key configured for a provider that supports image generation (OpenAI or Google Gemini). Add one in Settings.',
    };
  }

  const attempts: { provider: string; apiKey: string }[] = [
    { provider: imageProvider, apiKey: imageApiKey },
  ];
  for (const [id, info] of Object.entries(PROVIDERS)) {
    if (id !== imageProvider && info.capabilities.includes('Images')) {
      const key = await getApiKey(id);
      if (key) attempts.push({ provider: id, apiKey: key });
    }
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      let blob: Blob;
      if (attempt.provider === 'openai') {
        blob = await generateImageOpenAI(attempt.apiKey, prompt, size);
      } else if (attempt.provider === 'google') {
        blob = await generateImageGemini(attempt.apiKey, prompt);
      } else {
        continue;
      }
      return { blob, provider: attempt.provider };
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      errors.push(`${attempt.provider}: ${msg}`);
    }
  }
  return { error: `All image providers failed:\n${errors.join('\n')}` };
}

async function generateImageOpenAI(apiKey: string, prompt: string, size: string): Promise<Blob> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.images.generate({
    model: 'gpt-image-2',
    prompt,
    n: 1,
    size: size as '1024x1024' | '1536x1024' | '1024x1536',
    output_format: 'png',
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error('No image data returned from OpenAI');
  }

  const binary = Uint8Array.from(atob(imageData.b64_json), (c) => c.charCodeAt(0));
  return new Blob([binary], { type: 'image/png' });
}

async function generateImageGemini(apiKey: string, prompt: string): Promise<Blob> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });

  // Nano Banana 2 (gemini flash image). The Imagen endpoints shut down
  // 2026-08-17 — do not add them back. GA ID first, preview alias as fallback.
  const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview'];
  const errors: string[] = [];

  for (const model of IMAGE_MODELS) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `Generate an image: ${prompt}` }] }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK inline image type
          const inlineData = (part as any).inlineData;
          if (inlineData?.data && inlineData?.mimeType?.startsWith('image/')) {
            const binary = Uint8Array.from(atob(inlineData.data), (c) => c.charCodeAt(0));
            return new Blob([binary], { type: inlineData.mimeType });
          }
        }
      }
      errors.push(`${model}: no image data in response`);
    } catch (err: unknown) {
      errors.push(`${model}: ${(err as Error).message || String(err)}`);
    }
  }

  throw new Error(`No image data returned from Google Gemini (${errors.join('; ')})`);
}

/**
 * Find a workspace artifact by its canonical path. Exact matches only.
 *
 * The previous lookup also matched on bare filename (first match wins), which
 * was wrong in both directions: `delete_file("logo.png")` would delete
 * `images/logo.png` while the confirmation banner and the result both said
 * "logo.png", and `write_file("app.js")` was refused as "already exists"
 * because an unrelated `sub/app.js` shared the name — making the root file
 * impossible to create. Paths are unambiguous; the model gets real ones from
 * the workspace context, list_files, and search_files.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- artifact shape varies by service layer
function findArtifactByPath(artifacts: any[], path: string): any | null {
  const normalized = path.replace(/^\//, '');
  return (
    artifacts.find(
      (a: ArtifactPathSource & { type?: string }) =>
        a.type === 'artifact' && pathOf(a) === normalized,
    ) || null
  );
}

/** Tool names that mutate files (trigger workspace-context refresh) */
export const MUTATING_TOOLS = [
  'write_file',
  'edit_file',
  'delete_file',
  'generate_image',
  'rename_file',
];
