import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

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

  test('isInside follows symlinks: a link inside the folder that points outside is outside', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crux-paths-'));
    const project = path.join(root, 'project');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(project);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
    fs.symlinkSync(outside, path.join(project, 'link'), 'dir');
    fs.symlinkSync(path.join(project, 'src'), path.join(project, 'inner'), 'dir'); // dangling, inside
    try {
      expect(paths.isInside(project, path.join(project, 'link'))).toBe(false);
      expect(paths.isInside(project, path.join(project, 'link', 'secret.txt'))).toBe(false);
      expect(() => paths.resolveInsideOrThrow(project, 'link/secret.txt')).toThrow(/escapes/);
      // a symlink that stays inside, and a not-yet-created file, are fine
      expect(paths.isInside(project, path.join(project, 'inner', 'a.md'))).toBe(true);
      expect(paths.resolveInsideOrThrow(project, 'src/new.md')).toBe(
        path.join(project, 'src', 'new.md'),
      );
      // the base itself may be reached through a symlink
      const viaLink = path.join(root, 'project-link');
      fs.symlinkSync(project, viaLink, 'dir');
      expect(paths.isInside(viaLink, path.join(project, 'src', 'a.md'))).toBe(true);
      expect(paths.isInside(project, path.join(viaLink, 'src', 'a.md'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('case folding matches the filesystem (APFS and NTFS are case-insensitive by default)', () => {
    const inside = paths.isInside(base, path.join(base.toUpperCase(), 'a.txt'));
    expect(inside).toBe(process.platform === 'win32' || process.platform === 'darwin');
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

  test('resolveInsideOrThrow rejects segments Windows cannot store', () => {
    expect(() => paths.resolveInsideOrThrow(base, 'src/NUL.md')).toThrow(/reserved name/);
    expect(() => paths.resolveInsideOrThrow(base, 'con')).toThrow(/reserved name/);
    expect(() => paths.resolveInsideOrThrow(base, 'src/COM1')).toThrow(/reserved name/);
    expect(() => paths.resolveInsideOrThrow(base, 'src/notes./a.md')).toThrow(/trailing dot/);
    expect(() => paths.resolveInsideOrThrow(base, 'src/notes /a.md')).toThrow(
      /trailing dot or space/,
    );
    expect(() => paths.resolveInsideOrThrow(base, 'src/a:b.md')).toThrow(/forbidden character/);
    // names that merely contain a reserved word are fine
    expect(paths.resolveInsideOrThrow(base, 'src/console.md')).toBe(
      path.join(base, 'src', 'console.md'),
    );
    expect(paths.resolveInsideOrThrow(base, 'src/.hidden')).toBe(path.join(base, 'src', '.hidden'));
  });

  test('sanitizeFolderName is safe on Windows too', () => {
    expect(paths.sanitizeFolderName('My Blog!')).toBe('My-Blog');
    expect(paths.sanitizeFolderName('...hidden')).toBe('hidden');
    expect(paths.sanitizeFolderName('trailing. ')).toBe('trailing');
    expect(paths.sanitizeFolderName('dash---')).toBe('dash');
    expect(paths.sanitizeFolderName('CON')).toBe('CON-crux');
    expect(paths.sanitizeFolderName('com1')).toBe('com1-crux');
    expect(paths.sanitizeFolderName('nul.blog')).toBe('nul.blog-crux');
    expect(paths.sanitizeFolderName('')).toBe('crux');
    expect(paths.sanitizeFolderName('!!!')).toBe('crux');
  });

  test('toPosixRel always uses forward slashes', () => {
    expect(paths.toPosixRel(base, path.join(base, 'a', 'b', 'c.md'))).toBe('a/b/c.md');
  });
});
