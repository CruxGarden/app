import { getServices } from '@/services';
import type { ToolResultContent } from '@/services/types';
import type { ToolDefinition } from './adapters/types';
import { validateToolInput } from './validation';
import { formatToolError } from './errors';

const IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml',
]);

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
  {
    name: 'generate_image',
    description:
      'Generate an image using AI and save it to the workspace as a file. ' +
      'USE WHEN: The user asks you to create, generate, or design an image, icon, illustration, logo, photo, or graphic. ' +
      'This calls an image generation model (OpenAI) and saves the result as a PNG file in the workspace. ' +
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
];

/** MIME type map — matches api/src/ai/ai.service.ts getMimeType */
const MIME_MAP: Record<string, string> = {
  // Text / code
  ts: 'text/typescript',
  tsx: 'text/typescript',
  js: 'application/javascript',
  jsx: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  css: 'text/css',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  py: 'text/x-python',
  rs: 'text/x-rust',
  go: 'text/x-go',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/toml',
  sql: 'text/sql',
  sh: 'text/x-shellscript',
  xml: 'text/xml',
  csv: 'text/csv',
  // Images
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  // Documents
  pdf: 'application/pdf',
  // Archives
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  // Fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

/** Check if a MIME type represents a binary file (matches API's isBinaryMime) */
function isBinaryMime(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return false;
  if (mimeType === 'application/json') return false;
  if (mimeType === 'application/javascript') return false;
  if (mimeType === 'image/svg+xml') return false;
  return true;
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
 * @param onDeleteRequest - Callback for delete confirmation (yields to UI)
 */
export function createToolExecutor(
  cruxId: string,
  onDeleteRequest?: (path: string) => Promise<boolean>,
  chatModel?: string,
) {
  const { artifact: artifactService } = getServices();
  const recentlyReadFiles = new Set<string>();

  return async function executeTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<string | ToolResultContent> {
    // Validate inputs before execution
    const validation = validateToolInput(toolName, input);
    if (!validation.valid) {
      return formatToolError(toolName, validation.error!);
    }

    // Track read_file calls for read-before-edit enforcement
    if (toolName === 'read_file' && input.path) {
      const path = input.path as string;
      recentlyReadFiles.add(path);
      recentlyReadFiles.add(path.replace(/^\//, ''));
    }

    // Hard-enforce read-before-edit
    const normPath = (input.path as string | undefined)?.replace(/^\//, '');
    const hasBeenRead =
      input.path &&
      (recentlyReadFiles.has(input.path as string) ||
        recentlyReadFiles.has(normPath!));

    if (toolName === 'edit_file' && input.path && !hasBeenRead) {
      return formatToolError(
        'edit_file',
        `You must call read_file on "${normPath}" before editing it. Read the file first to get its current contents, then retry.`,
      );
    }

    // Hard-enforce read-before-write for existing files
    if (toolName === 'write_file' && input.path && !hasBeenRead) {
      const artifacts = await artifactService.findByResource('crux', cruxId);
      const existing = findArtifactByPath(artifacts, input.path as string);
      if (existing) {
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
          result = await toolDeleteFile(
            input,
            cruxId,
            artifactService,
            onDeleteRequest,
          );
          break;
        case 'list_files':
          result = await toolListFiles(cruxId, artifactService);
          break;
        case 'generate_image':
          result = await toolGenerateImage(input, cruxId, artifactService, chatModel);
          break;
        default:
          return formatToolError(toolName, `Unknown tool: ${toolName}`);
      }

      // Clear read tracking for mutated files (content changed, stale)
      if (toolName === 'write_file' || toolName === 'edit_file') {
        recentlyReadFiles.delete(input.path as string);
        recentlyReadFiles.delete(normPath!);
      }

      return result;
    } catch (err: unknown) {
      return formatToolError(toolName, err as Error);
    }
  };
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
      content.length <= 800
        ? content
        : content.slice(0, 400) + '\n…\n' + content.slice(-400);
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
    if (IMAGE_MIMES.has(mime)) {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let base64 = '';
      for (let i = 0; i < bytes.length; i++) {
        base64 += String.fromCharCode(bytes[i]!);
      }
      base64 = btoa(base64);
      return [
        { type: 'text', text: `[Image: ${path} (${mime}, ${buffer.byteLength} bytes)]` },
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
      ];
    }

    // Other binary files — return base64
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return `[Binary file: ${path} (${mime}, ${buffer.byteLength} bytes)] base64:${base64}`;
  }

  // Return full content — no truncation (matches API behavior)
  const content = await artifactService.readContent(match.id);
  return content;
}

async function toolDeleteFile(
  input: Record<string, unknown>,
  cruxId: string,
  artifactService: ArtifactService,
  onDeleteRequest?: (path: string) => Promise<boolean>,
): Promise<string> {
  const path = input.path as string;

  if (onDeleteRequest) {
    const confirmed = await onDeleteRequest(path);
    if (!confirmed) return `Delete cancelled by user: ${path}`;
  }

  const artifacts = await artifactService.findByResource('crux', cruxId);
  const match = findArtifactByPath(artifacts, path);
  if (!match) return formatToolError('delete_file', `File not found: ${path}`);

  await artifactService.delete(match.id);
  return `Deleted file: ${path}`;
}

async function toolListFiles(
  cruxId: string,
  artifactService: ArtifactService,
): Promise<string> {
  const artifacts = await artifactService.findByResource('crux', cruxId);
  const files = artifacts
    .filter((a: { type: string }) => a.type === 'artifact')
    .map(
      (a: { meta?: { path?: string }; filename: string }) =>
        a.meta?.path || a.filename,
    );
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

  const { getApiKey } = await import('./keys');
  const { getProviderForModel } = await import('./providers');
  const { PROVIDERS } = await import('./providers');

  // Determine which provider to use for image generation:
  // 1. If the current chat provider supports images, use it
  // 2. Otherwise fall back to any provider that supports images
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

  // Fallback: try any provider that supports images
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
    return formatToolError(
      'generate_image',
      'No API key configured for a provider that supports image generation (OpenAI or Google Gemini). Add one in Settings.',
    );
  }

  // Build ordered list of providers to try: current provider first, then fallbacks
  const attempts: { provider: string; apiKey: string }[] = [
    { provider: imageProvider, apiKey: imageApiKey },
  ];
  // Add other image-capable providers as fallbacks
  for (const [id, info] of Object.entries(PROVIDERS)) {
    if (id !== imageProvider && info.capabilities.includes('Images')) {
      const key = await getApiKey(id);
      if (key) attempts.push({ provider: id, apiKey: key });
    }
  }

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      let imageBlob: Blob;

      if (attempt.provider === 'openai') {
        imageBlob = await generateImageOpenAI(attempt.apiKey, prompt, size);
      } else if (attempt.provider === 'google') {
        imageBlob = await generateImageGemini(attempt.apiKey, prompt);
      } else {
        continue;
      }

      await artifactService.upload({
        resourceId: cruxId,
        resourceType: 'crux',
        blob: imageBlob,
        meta: { path },
      });

      return `Generated and saved image: ${path}`;
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      errors.push(`${attempt.provider}: ${msg}`);
      // Continue to next provider
    }
  }

  return formatToolError('generate_image', `All image providers failed:\n${errors.join('\n')}`);
}

async function generateImageOpenAI(apiKey: string, prompt: string, size: string): Promise<Blob> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.images.generate({
    model: 'gpt-image-1',
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

  // Try 1: Imagen (requires paid plan)
  try {
    const response = await client.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: { numberOfImages: 1 },
    });

    const image = response.generatedImages?.[0];
    if (image?.image?.imageBytes) {
      const binary = Uint8Array.from(atob(image.image.imageBytes), (c) => c.charCodeAt(0));
      return new Blob([binary], { type: 'image/png' });
    }
  } catch {
    // Imagen failed (likely paid plan required) — try native Gemini
  }

  // Try 2: Native Gemini image generation via generateContent with responseModalities
  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: `Generate an image: ${prompt}` }] }],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  });

  // Extract inline image from response parts
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

  throw new Error('No image data returned from Google Gemini (tried Imagen and native generation)');
}

/**
 * Find an artifact by path, matching the API's findAttachmentByPath.
 * Checks meta.path AND filename independently, with normalized path (no leading slash).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- artifact shape varies by service layer
function findArtifactByPath(artifacts: any[], path: string): any | null {
  const normalized = path.replace(/^\//, '');
  return (
    artifacts.find(
      (a: { meta?: { path?: string }; filename?: string }) =>
        a.meta?.path === path ||
        a.meta?.path === normalized ||
        a.filename === path ||
        a.filename === normalized,
    ) || null
  );
}

/** Tool names that mutate files (trigger system prompt refresh) */
export const MUTATING_TOOLS = ['write_file', 'edit_file', 'delete_file', 'generate_image'];
