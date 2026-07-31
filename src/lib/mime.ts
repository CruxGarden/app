/**
 * The one MIME module. Every "what kind of file is this" question in the app
 * goes through here — the tables are private, the predicates are the interface.
 *
 * Consolidates four previously independent classifiers (ai/tools, sqlite
 * helpers, cruxStore, useFileContent). Content-based text sniffing (null-byte
 * scan) intentionally stays in ingestion — it classifies bytes, not names.
 */

const MIME_BY_EXT: Record<string, string> = {
  // Text / code
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  cjs: 'application/javascript',
  jsx: 'application/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  json: 'application/json',
  md: 'text/markdown',
  mdx: 'text/markdown',
  txt: 'text/plain',
  astro: 'text/plain',
  py: 'text/x-python',
  rb: 'text/x-ruby',
  rs: 'text/x-rust',
  go: 'text/x-go',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  h: 'text/x-c',
  sh: 'text/x-sh',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/x-toml',
  sql: 'text/sql',
  xml: 'application/xml',
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

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/svg+xml',
]);

const TEXT_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'image/svg+xml',
];

const TEXT_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'csv', 'log',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'json', 'jsonc', 'json5',
  'html', 'htm', 'xml', 'svg', 'css', 'scss', 'less',
  'py', 'rb', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sql', 'graphql', 'gql',
  'vue', 'svelte', 'astro',
  'makefile', 'dockerfile',
]);

/** File-extension → MIME type; 'application/octet-stream' when unknown. */
export function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime);
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/');
}

/** True when the content should be treated as opaque bytes (no text editing). */
export function isBinaryMime(mime: string): boolean {
  return !TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

/** True when the file is text-editable, judged by MIME and (optionally) name. */
export function isTextMime(mime: string, filename?: string): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (TEXT_EXTENSIONS.has(ext)) return true;
    const base = filename.split('/').pop()?.toLowerCase() || '';
    if (TEXT_EXTENSIONS.has(base)) return true;
  }
  return false;
}
