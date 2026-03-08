import { describe, it, expect } from 'vitest';
import { generateSlug, guessMimeType, hashContent, toAttachment } from './helpers';
import type { ArtifactRecord } from './schema';

describe('generateSlug', () => {
  it('converts title to lowercase kebab-case', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('strips non-alphanumeric characters', () => {
    expect(generateSlug('My App! (v2.0)')).toBe('my-app-v2-0');
  });

  it('trims leading/trailing hyphens', () => {
    expect(generateSlug('---hello---')).toBe('hello');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(generateSlug(long).length).toBeLessThanOrEqual(64);
  });

  it('generates a UUID-based slug when title is empty', () => {
    const slug = generateSlug('');
    expect(slug).toHaveLength(8);
  });

  it('generates a UUID-based slug when title is undefined', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(8);
  });

  it('generates a UUID-based slug when title produces empty string after sanitization', () => {
    const slug = generateSlug('!!!');
    expect(slug).toHaveLength(8);
  });
});

describe('guessMimeType', () => {
  it('returns correct MIME for common web files', () => {
    expect(guessMimeType('index.html')).toBe('text/html');
    expect(guessMimeType('style.css')).toBe('text/css');
    expect(guessMimeType('app.js')).toBe('application/javascript');
    expect(guessMimeType('data.json')).toBe('application/json');
    expect(guessMimeType('readme.md')).toBe('text/markdown');
  });

  it('returns correct MIME for images', () => {
    expect(guessMimeType('photo.png')).toBe('image/png');
    expect(guessMimeType('photo.jpg')).toBe('image/jpeg');
    expect(guessMimeType('icon.svg')).toBe('image/svg+xml');
    expect(guessMimeType('banner.webp')).toBe('image/webp');
  });

  it('handles paths with directories', () => {
    expect(guessMimeType('src/components/App.tsx')).toBe('text/typescript');
  });

  it('is case-insensitive', () => {
    expect(guessMimeType('FILE.HTML')).toBe('text/html');
    expect(guessMimeType('image.PNG')).toBe('image/png');
  });

  it('returns octet-stream for unknown extensions', () => {
    expect(guessMimeType('file.xyz')).toBe('application/octet-stream');
  });
});

describe('hashContent', () => {
  it('produces a 64-char hex string for text', async () => {
    const hash = await hashContent('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces deterministic output', async () => {
    const a = await hashContent('test content');
    const b = await hashContent('test content');
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', async () => {
    const a = await hashContent('file A');
    const b = await hashContent('file B');
    expect(a).not.toBe(b);
  });

  it('hashes Blobs', async () => {
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    const hash = await hashContent(blob);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces same hash for string and Blob with identical content', async () => {
    const text = 'identical content';
    const stringHash = await hashContent(text);
    const blobHash = await hashContent(new Blob([text]));
    expect(stringHash).toBe(blobHash);
  });
});

describe('toAttachment', () => {
  it('strips content, path, and fingerprint from ArtifactRecord', () => {
    const record: ArtifactRecord = {
      id: 'test-id',
      type: 'artifact',
      kind: 'file',
      meta: { path: 'index.html' },
      resourceId: 'crux-1',
      resourceType: 'crux',
      authorId: 'author-1',
      homeId: 'home-1',
      encoding: 'utf-8',
      mimeType: 'text/html',
      filename: 'index.html',
      size: 100,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      path: 'index.html',
      content: '<html></html>',
      fingerprint: 'abc123',
    };

    const attachment = toAttachment(record);

    expect(attachment.id).toBe('test-id');
    expect(attachment.meta?.path).toBe('index.html');
    expect(attachment.mimeType).toBe('text/html');
    // Dexie-only fields should be stripped
    expect('content' in attachment).toBe(false);
    expect('path' in attachment).toBe(false);
    expect('fingerprint' in attachment).toBe(false);
  });
});
