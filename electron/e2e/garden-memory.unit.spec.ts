import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { readGardenMemory, writeGardenMemory, MEMORY_MAX_BYTES } =
  require('../dist/garden-memory') as typeof import('../src/garden-memory');

test('memory file survives restart, rejects stale replacement and leaves unrelated files alone', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-memory-'));
  try {
    fs.writeFileSync(join(root, 'other.txt'), 'Private project');
    expect(readGardenMemory(root)).toBeNull();
    writeGardenMemory(root, 'Original notes', null);
    expect(readGardenMemory(root)).toBe('Original notes');
    fs.writeFileSync(join(root, 'memory.md'), 'External notes');
    expect(() => writeGardenMemory(root, 'Stale edits', 'Original notes')).toThrow(/changed/);
    expect(readGardenMemory(root)).toBe('External notes');
    writeGardenMemory(root, 'Reviewed edits', 'External notes');
    expect(readGardenMemory(root)).toBe('Reviewed edits');
    expect(fs.readFileSync(join(root, 'other.txt'), 'utf8')).toBe('Private project');
    expect(fs.readdirSync(root).sort()).toEqual(['memory.md', 'other.txt']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('memory refuses hardlinks and oversized writes without changing existing bytes', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-memory-'));
  try {
    const target = join(root, 'private.txt');
    fs.writeFileSync(target, 'Keep private');
    fs.linkSync(target, join(root, 'memory.md'));
    expect(() => readGardenMemory(root)).toThrow(/not a link/);
    expect(() => writeGardenMemory(root, 'Overwrite', 'Keep private')).toThrow(/not a link/);
    expect(fs.readFileSync(target, 'utf8')).toBe('Keep private');
    fs.unlinkSync(join(root, 'memory.md'));
    writeGardenMemory(root, 'Saved', null);
    expect(() => writeGardenMemory(root, 'x'.repeat(MEMORY_MAX_BYTES + 1), 'Saved')).toThrow(
      /64 KiB/,
    );
    expect(readGardenMemory(root)).toBe('Saved');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('memory refuses symbolic links and non-text data', () => {
  test.skip(
    process.platform === 'win32',
    'Windows symlink creation requires host privileges; hardlink refusal runs everywhere.',
  );
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-memory-'));
  try {
    const target = join(root, 'private.txt');
    fs.writeFileSync(target, 'Keep private');
    fs.symlinkSync(target, join(root, 'memory.md'));
    expect(() => readGardenMemory(root)).toThrow(/not a link/);
    expect(() => writeGardenMemory(root, 'Overwrite', 'Keep private')).toThrow(/not a link/);
    fs.unlinkSync(join(root, 'memory.md'));
    fs.writeFileSync(join(root, 'memory.md'), Buffer.from([0xff, 0xfe]));
    expect(() => readGardenMemory(root)).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('Keep private');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
