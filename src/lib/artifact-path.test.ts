import { describe, it, expect } from 'vitest';
import {
  pathOf,
  basename,
  displayNameOf,
  extensionOf,
  parentPath,
  isUnder,
  normalizePath,
} from './artifact-path';

describe('artifact-path', () => {
  it('prefers meta.path over filename', () => {
    expect(pathOf({ meta: { path: 'src/app.js' }, filename: 'app.js' })).toBe('src/app.js');
    expect(pathOf({ filename: 'app.js' })).toBe('app.js');
    expect(pathOf({})).toBe('');
    expect(pathOf({ meta: { path: '' }, filename: 'x' })).toBe('x');
  });

  it('derives display names with a stable fallback', () => {
    expect(displayNameOf({ meta: { path: 'a/b/c.png' } })).toBe('c.png');
    expect(displayNameOf({})).toBe('file');
    expect(displayNameOf({}, 'media')).toBe('media');
  });

  it('basename and parentPath are inverses around the last slash', () => {
    expect(basename('a/b/c.txt')).toBe('c.txt');
    expect(basename('c.txt')).toBe('c.txt');
    expect(parentPath('a/b/c.txt')).toBe('a/b');
    expect(parentPath('c.txt')).toBe('');
  });

  it('extracts extensions without treating dotfiles as extensions', () => {
    expect(extensionOf('a/b/index.HTML')).toBe('html');
    expect(extensionOf('src/.env')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('isUnder matches the folder itself and descendants only', () => {
    expect(isUnder('src', 'src')).toBe(true);
    expect(isUnder('src', 'src/app.js')).toBe(true);
    expect(isUnder('src', 'srcx/app.js')).toBe(false);
  });

  it('normalizes a single leading slash', () => {
    expect(normalizePath('/a/b')).toBe('a/b');
    expect(normalizePath('a/b')).toBe('a/b');
  });
});
