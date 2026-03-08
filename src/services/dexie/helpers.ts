import type { Attachment } from '../types';
import type { ArtifactRecord } from './schema';

export function toAttachment(row: ArtifactRecord): Attachment {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { content, path, fingerprint, ...attachment } = row;
  return attachment;
}

export function generateSlug(title?: string): string {
  if (!title) return crypto.randomUUID().slice(0, 8);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || crypto.randomUUID().slice(0, 8);
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.csv': 'text/csv',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.sh': 'text/x-sh',
  '.toml': 'text/x-toml',
};

export function guessMimeType(path: string): string {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

export async function hashContent(content: string | Blob): Promise<string> {
  const buffer =
    typeof content === 'string'
      ? new TextEncoder().encode(content)
      : new Uint8Array(await content.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
