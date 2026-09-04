import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as os from 'node:os';

/** Pure path rules (compiled to dist/paths.js by `npm run build`) — no Electron needed. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const paths = require('../dist/paths.js') as typeof import('../src/paths');

test.describe('Project Folder path rules', () => {
  const base = path.join(os.tmpdir(), 'crux-paths-base');

  test('isInside accepts the base and children, rejects siblings, parents and traversal', () => {
    expect(paths.isInside(base, base)).toBe(true);
    expect(paths.isInside(base, path.join(base, 'a', 'b.txt'))).toBe(true);
    expect(paths.isInside(base, path.join(base, '..'))).toBe(false);
    expect(paths.isInside(base, base + '-evil')).toBe(false); // prefix trick
    expect(paths.isInside(base, path.join(base, '..', 'other'))).toBe(false);
  });

  test('resolveInsideOrThrow normalizes either separator and refuses escapes', () => {
    expect(paths.resolveInsideOrThrow(base, 'src/pages/index.astro')).toBe(
      path.join(base, 'src', 'pages', 'index.astro'),
    );
    expect(paths.resolveInsideOrThrow(base, 'src\\pages\\index.astro')).toBe(
      path.join(base, 'src', 'pages', 'index.astro'),
    );
    expect(() => paths.resolveInsideOrThrow(base, '../secret')).toThrow(/escapes/);
    expect(() => paths.resolveInsideOrThrow(base, 'a/../../secret')).toThrow(/escapes/);
    expect(() => paths.resolveInsideOrThrow(base, '/etc/passwd')).toThrow(/escapes/);
    expect(() => paths.resolveInsideOrThrow(base, 'C:\\Windows\\win.ini')).toThrow(/escapes/);
    expect(paths.resolveInsideOrThrow(base, '.')).toBe(path.resolve(base));
  });

  test('sanitizeFolderName is safe on Windows too', () => {
    expect(paths.sanitizeFolderName('My Blog!')).toBe('My-Blog-');
    expect(paths.sanitizeFolderName('...hidden')).toBe('hidden');
    expect(paths.sanitizeFolderName('trailing. ')).toBe('trailing');
    expect(paths.sanitizeFolderName('CON')).toBe('CON-crux');
    expect(paths.sanitizeFolderName('com1')).toBe('com1-crux');
    expect(paths.sanitizeFolderName('')).toBe('crux');
  });

  test('toPosixRel always uses forward slashes', () => {
    expect(paths.toPosixRel(base, path.join(base, 'a', 'b', 'c.md'))).toBe('a/b/c.md');
  });
});
