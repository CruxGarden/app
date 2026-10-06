import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { projectRename } from '../../electron/src/project-rename';
import type { FileRenameIntent } from '@cruxgarden/local-api';

let dir: string;
let folder: string;
let intent: FileRenameIntent;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const entry = (path: string, bytes: string) => ({
  id: randomUUID(),
  path,
  fingerprint: hash(bytes),
  size: bytes.length,
  mode: 0o644,
  mimeType: 'text/plain',
  encoding: 'utf-8' as const,
  attributes: {},
});
const apply = () =>
  projectRename(folder, join(folder, 'source.txt'), join(folder, 'target.txt'), intent, true);
beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'crux-rename-host-'));
  folder = join(dir, 'project');
  fs.mkdirSync(folder);
  fs.writeFileSync(join(folder, 'source.txt'), 'Source');
  fs.writeFileSync(join(folder, 'target.txt'), 'Target');
  const source = entry('source.txt', 'Source');
  intent = {
    kind: 'rename',
    operationId: randomUUID(),
    source,
    target: entry('target.txt', 'Target'),
    entry: { ...source, path: 'target.txt' },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
it('stages originals, finalizes without replacing arrivals, and replays completion', () => {
  fs.writeFileSync(join(folder, 'external.txt'), 'Keep');
  apply();
  apply();
  expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Source');
  expect(fs.existsSync(join(folder, 'source.txt'))).toBe(false);
  expect(
    fs.readFileSync(`${folder}/.crux-recovery/rename/${intent.operationId}/target`, 'utf8'),
  ).toBe('Target');
  expect(fs.readFileSync(join(folder, 'external.txt'), 'utf8')).toBe('Keep');
});
it('retains destination writes made through an already-open external editor handle', () => {
  const fd = fs.openSync(join(folder, 'target.txt'), 'r+');
  try {
    apply();
    fs.writeSync(fd, Buffer.from('Unsaved target edit'), 0, 19, 0);
    expect(
      fs.readFileSync(`${folder}/.crux-recovery/rename/${intent.operationId}/target`, 'utf8'),
    ).toBe('Unsaved target edit');
    expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Source');
  } finally {
    fs.closeSync(fd);
  }
});
it('preserves a racing destination and resumes only after its explicit removal', () => {
  const original = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementationOnce((from, to) => {
    fs.writeFileSync(to, 'External arrival');
    return original(from, to);
  });
  expect(apply).toThrow();
  expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('External arrival');
  expect(
    fs.readFileSync(`${folder}/.crux-recovery/rename/${intent.operationId}/source`, 'utf8'),
  ).toBe('Source');
  expect(
    fs.readFileSync(`${folder}/.crux-recovery/rename/${intent.operationId}/target`, 'utf8'),
  ).toBe('Target');
  fs.renameSync(join(folder, 'target.txt'), join(folder, 'external.txt'));
  apply();
  expect(fs.readFileSync(join(folder, 'external.txt'), 'utf8')).toBe('External arrival');
});
it('retains unexpected bytes that race source staging and refuses to finalize', () => {
  const original = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementationOnce((from, to) => {
    fs.writeFileSync(from, 'External source edit');
    return original(from, to);
  });
  expect(apply).toThrow(/changed/);
  expect(fs.readFileSync(join(folder, 'source.txt'), 'utf8')).toBe('External source edit');
  expect(
    fs.readFileSync(`${folder}/.crux-recovery/rename/${intent.operationId}/source`, 'utf8'),
  ).toBe('External source edit');
  expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Target');
});

it('preserves the source inode when the original destination has identical bytes', () => {
  fs.writeFileSync(join(folder, 'target.txt'), 'Source');
  intent.target = entry('target.txt', 'Source');
  const fd = fs.openSync(join(folder, 'source.txt'), 'r+');
  try {
    apply();
    fs.writeSync(fd, Buffer.from('Newest'), 0, 6, 0);
    expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Newest');
    expect(
      fs.readFileSync(`${folder}/.crux-recovery/rename/${intent.operationId}/target`, 'utf8'),
    ).toBe('Source');
  } finally {
    fs.closeSync(fd);
  }
});

it('replays its durable completion after a later destination edit without changing it', () => {
  apply();
  fs.writeFileSync(join(folder, 'target.txt'), 'External edit after completion');
  fs.writeFileSync(join(folder, 'source.txt'), 'New source path');
  apply();
  expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe(
    'External edit after completion',
  );
  expect(fs.readFileSync(join(folder, 'source.txt'), 'utf8')).toBe('New source path');
});
it('refuses recovery symlinks before changing either file', () => {
  const outside = join(dir, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, join(folder, '.crux-recovery'), 'dir');
  expect(() =>
    projectRename(folder, join(folder, 'source.txt'), join(folder, 'target.txt'), intent, false),
  ).toThrow(/changed/);
  expect(fs.readdirSync(outside)).toEqual([]);
  expect(fs.readFileSync(join(folder, 'source.txt'), 'utf8')).toBe('Source');
  expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Target');
});

it.each(['source.txt', 'target.txt'])(
  'refuses a permission change to %s after rename approval',
  (file) => {
    projectRename(folder, join(folder, 'source.txt'), join(folder, 'target.txt'), intent, false);
    fs.chmodSync(join(folder, file), 0o444);
    expect(() =>
      projectRename(folder, join(folder, 'source.txt'), join(folder, 'target.txt'), intent, false),
    ).toThrow(/changed/);
    expect(apply).toThrow(/changed/);
    expect(fs.statSync(join(folder, file)).mode & 0o200).toBe(0);
    expect(fs.readFileSync(join(folder, file), 'utf8')).toBe(
      file === 'source.txt' ? 'Source' : 'Target',
    );
  },
);

it('renames case spelling on both case-sensitive and insensitive filesystems', () => {
  const renamed = { ...intent, target: null, entry: { ...intent.source, path: 'Source.txt' } };
  projectRename(folder, join(folder, 'source.txt'), join(folder, 'Source.txt'), renamed, false);
  projectRename(folder, join(folder, 'source.txt'), join(folder, 'Source.txt'), renamed, true);
  expect(fs.readdirSync(folder)).toContain('Source.txt');
  expect(fs.readdirSync(folder)).not.toContain('source.txt');
  expect(fs.readFileSync(join(folder, 'Source.txt'), 'utf8')).toBe('Source');
  expect(fs.readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Target');
});
it('does not mistake an unapproved case-variant distinct file for an alias', () => {
  const distinct = join(folder, 'Source.txt');
  if (fs.existsSync(distinct)) return; // This filesystem resolves it to source.txt.
  fs.writeFileSync(distinct, 'Source');
  const renamed = { ...intent, target: null, entry: { ...intent.source, path: 'Source.txt' } };
  expect(() => projectRename(folder, join(folder, 'source.txt'), distinct, renamed, false)).toThrow(
    /changed/,
  );
  expect(fs.readFileSync(distinct, 'utf8')).toBe('Source');
  expect(fs.readdirSync(folder)).toContain('source.txt');
});
