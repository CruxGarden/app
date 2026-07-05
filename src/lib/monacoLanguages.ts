const EXT_TO_MONACO: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  astro: 'html',
  htm: 'html',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  xml: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  swift: 'swift',
  kt: 'kotlin',
  toml: 'ini',
  ini: 'ini',
  dockerfile: 'dockerfile',
};

export function getMonacoLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const base = filename.split('/').pop()?.toLowerCase() || '';

  // Handle files without extensions
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';

  return EXT_TO_MONACO[ext] || 'plaintext';
}

export function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

const PREVIEWABLE_EXTS = new Set(['html', 'htm', 'svg', 'md', 'mdx', 'astro']);

export function isPreviewable(filename: string): boolean {
  return PREVIEWABLE_EXTS.has(getExtension(filename));
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico']);

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTS.has(getExtension(filename));
}
