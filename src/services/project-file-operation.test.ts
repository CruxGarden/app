import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { projectFileOperation } from '../../electron/src/project-file-operation';
import { projectFileModeMatches } from '../../electron/src/project-file-mode';
import type { FileWriteIntent, FileDeleteIntent } from '@cruxgarden/local-api';

let dir: string;
let folder: string;
let intent: FileWriteIntent | FileDeleteIntent;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const changedMode = process.platform === 'win32' ? 0o444 : 0o755;
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
const target = () => join(folder, 'target.txt');
const stage = () => join(folder, '.crux-recovery', intent.kind, intent.operationId);
const apply = () =>
  projectFileOperation(folder, target(), intent, true, Buffer.from('Replacement'));
const preflight = () => projectFileOperation(folder, target(), intent, false);
beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'crux-file-operation-host-'));
  folder = join(dir, 'project');
  fs.mkdirSync(folder);
  fs.writeFileSync(target(), 'Original');
  intent = {
    kind: 'write',
    operationId: randomUUID(),
    before: entry('target.txt', 'Original'),
    entry: entry('target.txt', 'Replacement'),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

it.each(['write', 'delete'] as const)(
  '%s admission leaves the disk untouched and refuses later unindexed content',
  (kind) => {
    if (kind === 'delete')
      intent = { kind, operationId: randomUUID(), source: entry('target.txt', 'Original') };
    const inode = fs.statSync(target()).ino;
    preflight();
    expect(fs.statSync(target()).ino).toBe(inode);
    expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
    expect(fs.existsSync(join(folder, '.crux-recovery'))).toBe(false);
    fs.writeFileSync(target(), 'New external work');
    expect(preflight).toThrow(/changed/);
    expect(apply).toThrow(/changed/);
    expect(fs.readFileSync(target(), 'utf8')).toBe('New external work');
  },
);

it.each(['write', 'delete'] as const)(
  '%s refuses an external permission change after approval',
  (kind) => {
    if (kind === 'delete')
      intent = { kind, operationId: randomUUID(), source: entry('target.txt', 'Original') };
    preflight();
    fs.chmodSync(target(), changedMode);
    expect(preflight).toThrow(/changed/);
    expect(apply).toThrow(/changed/);
    expect(fs.statSync(target()).mode & 0o777).toBe(changedMode);
    expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
  },
);

it('retains a permission change racing original staging instead of installing replacement bytes', () => {
  const link = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementationOnce((from, to) => {
    fs.chmodSync(from, changedMode);
    return link(from, to);
  });
  expect(apply).toThrow(/changed/);
  expect(fs.statSync(target()).mode & 0o777).toBe(changedMode);
  expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
  expect(fs.statSync(join(stage(), 'original')).mode & 0o777).toBe(changedMode);
});

it('compares POSIX permissions and Windows supported read-only/write state', () => {
  for (const platform of ['linux', 'darwin'] as const) {
    expect(projectFileModeMatches(0o100644, 0o644, platform)).toBe(true);
    expect(projectFileModeMatches(0o755, 0o644, platform)).toBe(false);
    expect(projectFileModeMatches(0o600, 0o644, platform)).toBe(false);
  }
  expect(projectFileModeMatches(0o666, 0o644, 'win32')).toBe(true);
  expect(projectFileModeMatches(0o666, 0o755, 'win32')).toBe(true);
  expect(projectFileModeMatches(0o444, 0o400, 'win32')).toBe(true);
  expect(projectFileModeMatches(0o444, 0o644, 'win32')).toBe(false);
  expect(projectFileModeMatches(0o666, 0o444, 'win32')).toBe(false);
});

it.each(['write', 'delete'] as const)(
  '%s retains the original inode and later writes through an open editor handle',
  (kind) => {
    if (kind === 'delete')
      intent = { kind, operationId: randomUUID(), source: entry('target.txt', 'Original') };
    fs.writeFileSync(join(folder, 'untracked.txt'), 'Keep untracked work');
    const fd = fs.openSync(target(), 'r+');
    try {
      preflight();
      apply();
      fs.writeSync(fd, Buffer.from('Later external edit'), 0, 19, 0);
      expect(fs.readFileSync(join(stage(), 'original'), 'utf8')).toBe('Later external edit');
      if (kind === 'write') expect(fs.readFileSync(target(), 'utf8')).toBe('Replacement');
      else expect(fs.existsSync(target())).toBe(false);
      expect(fs.readFileSync(join(folder, 'untracked.txt'), 'utf8')).toBe('Keep untracked work');
    } finally {
      fs.closeSync(fd);
    }
  },
);

it.each(['write', 'delete'] as const)(
  '%s receipt replay never overwrites work created after completion',
  (kind) => {
    if (kind === 'delete')
      intent = { kind, operationId: randomUUID(), source: entry('target.txt', 'Original') };
    apply();
    fs.writeFileSync(target(), 'Work after completed operation');
    apply();
    expect(fs.readFileSync(target(), 'utf8')).toBe('Work after completed operation');
  },
);

it('creates only the approved missing path and refuses an unapproved arrival', () => {
  fs.unlinkSync(target());
  intent = {
    kind: 'write',
    operationId: randomUUID(),
    before: null,
    entry: entry('target.txt', 'Replacement'),
  };
  preflight();
  fs.writeFileSync(target(), 'Unapproved arrival');
  expect(apply).toThrow(/changed/);
  expect(fs.readFileSync(target(), 'utf8')).toBe('Unapproved arrival');
  fs.renameSync(target(), join(folder, 'saved-arrival.txt'));
  apply();
  expect(fs.readFileSync(target(), 'utf8')).toBe('Replacement');
  expect(fs.readFileSync(join(folder, 'saved-arrival.txt'), 'utf8')).toBe('Unapproved arrival');
});

it('retains a changed source that races exclusive original staging', () => {
  const link = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementationOnce((from, to) => {
    fs.writeFileSync(from, 'External change while staging');
    return link(from, to);
  });
  expect(apply).toThrow(/changed/);
  expect(fs.readFileSync(target(), 'utf8')).toBe('External change while staging');
  expect(fs.readFileSync(join(stage(), 'original'), 'utf8')).toBe('External change while staging');
});

it.each(['write', 'delete'] as const)(
  '%s preserves a new inode that races removal of the live name',
  (kind) => {
    if (kind === 'delete')
      intent = { kind, operationId: randomUUID(), source: entry('target.txt', 'Original') };
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementationOnce((from, to) => {
      const arrival = join(folder, 'arrival.txt');
      fs.writeFileSync(arrival, 'Unexpected arriving inode');
      rename(arrival, from);
      return rename(from, to);
    });
    expect(apply).toThrow(/changed/);
    expect(fs.readFileSync(target(), 'utf8')).toBe('Unexpected arriving inode');
    expect(fs.readFileSync(join(stage(), 'original'), 'utf8')).toBe('Original');
    const moved = fs.readdirSync(stage()).find((name) => name.startsWith('move-'))!;
    expect(fs.readFileSync(join(stage(), moved, 'file'), 'utf8')).toBe('Unexpected arriving inode');
  },
);

it('preserves an arrival racing final write installation and resumes after explicit conflict removal', () => {
  const link = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementation((from, to) => {
    if (String(from).endsWith('replacement') && to === target()) {
      vi.mocked(fs.linkSync).mockImplementation(link);
      fs.writeFileSync(to, 'Arrival before installation');
    }
    return link(from, to);
  });
  expect(apply).toThrow();
  expect(fs.readFileSync(target(), 'utf8')).toBe('Arrival before installation');
  expect(fs.readFileSync(join(stage(), 'original'), 'utf8')).toBe('Original');
  fs.renameSync(target(), join(folder, 'preserved-arrival.txt'));
  apply();
  expect(fs.readFileSync(target(), 'utf8')).toBe('Replacement');
  expect(fs.readFileSync(join(folder, 'preserved-arrival.txt'), 'utf8')).toBe(
    'Arrival before installation',
  );
});

it.each(['write', 'delete'] as const)(
  '%s resumes an interrupted completion receipt without repeating a completed change',
  (kind) => {
    if (kind === 'delete')
      intent = { kind, operationId: randomUUID(), source: entry('target.txt', 'Original') };
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).endsWith('completed.json')) {
        vi.mocked(fs.writeFileSync).mockImplementation(write);
        throw new Error('Receipt refused');
      }
      return write(file, ...args);
    });
    expect(apply).toThrow('Receipt refused');
    apply();
    expect(fs.existsSync(join(stage(), 'completed.json'))).toBe(true);
    if (kind === 'write') expect(fs.readFileSync(target(), 'utf8')).toBe('Replacement');
    else expect(fs.existsSync(target())).toBe(false);
  },
);

it('replacing identical bytes still retains an independent original inode', () => {
  intent = {
    kind: 'write',
    operationId: randomUUID(),
    before: entry('target.txt', 'Original'),
    entry: entry('target.txt', 'Original'),
  };
  projectFileOperation(folder, target(), intent, true, Buffer.from('Original'));
  fs.writeFileSync(join(stage(), 'original'), 'Later write to original');
  expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
});

it('refuses corrupt replacement bytes and invalid private paths before changing the original', () => {
  expect(() => projectFileOperation(folder, target(), intent, true, Buffer.from('Wrong'))).toThrow(
    /verification/,
  );
  expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
  const outside = join(dir, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, join(folder, '.crux-recovery'), 'dir');
  expect(preflight).toThrow(/changed/);
  expect(apply).toThrow(/changed/);
  expect(fs.readdirSync(outside)).toEqual([]);
  expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
});

function nestedDeletion() {
  const relative = 'docs/nested/.keep';
  const file = join(folder, relative);
  fs.mkdirSync(join(folder, 'docs/nested'), { recursive: true });
  fs.writeFileSync(file, '');
  const deletion: FileDeleteIntent = {
    kind: 'delete',
    operationId: randomUUID(),
    source: entry(relative, ''),
  };
  return { deletion, run: () => projectFileOperation(folder, file, deletion, true) };
}

it('deleting the last file prunes empty ancestors inside the Project Folder and replay preserves recreated folders', () => {
  const { deletion, run } = nestedDeletion();
  run();
  expect(fs.existsSync(join(folder, 'docs'))).toBe(false);
  expect(fs.statSync(folder).isDirectory()).toBe(true);
  expect(fs.readFileSync(target(), 'utf8')).toBe('Original');
  expect(
    fs.readFileSync(
      join(folder, '.crux-recovery/delete', deletion.operationId, 'original'),
      'utf8',
    ),
  ).toBe('');
  fs.mkdirSync(join(folder, 'docs/nested'), { recursive: true });
  run();
  expect(fs.statSync(join(folder, 'docs/nested')).isDirectory()).toBe(true);
});

it.each(['existing', 'arriving'] as const)(
  'empty-parent cleanup stops at unrelated %s files',
  (kind) => {
    const { run } = nestedDeletion();
    fs.writeFileSync(join(folder, 'docs/untracked.txt'), 'External sibling');
    const remove = fs.rmdirSync;
    vi.spyOn(fs, 'rmdirSync').mockImplementation((directory) => {
      if (kind === 'arriving' && directory === join(folder, 'docs/nested'))
        fs.writeFileSync(join(folder, 'docs/nested/arrival.txt'), 'Arrived before cleanup');
      return remove(directory);
    });
    run();
    expect(fs.readFileSync(join(folder, 'docs/untracked.txt'), 'utf8')).toBe('External sibling');
    if (kind === 'arriving')
      expect(fs.readFileSync(join(folder, 'docs/nested/arrival.txt'), 'utf8')).toBe(
        'Arrived before cleanup',
      );
    else expect(fs.existsSync(join(folder, 'docs/nested'))).toBe(false);
  },
);

it.each(['directory', 'symlink'] as const)(
  'empty-parent cleanup preserves a new %s in place of an admitted ancestor',
  (replacement) => {
    const { run } = nestedDeletion();
    const outside = join(dir, 'outside');
    fs.mkdirSync(join(outside, 'nested'), { recursive: true });
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).endsWith('completed.json')) {
        fs.renameSync(join(folder, 'docs'), join(folder, 'preserved-docs'));
        if (replacement === 'directory')
          fs.mkdirSync(join(folder, 'docs/nested'), { recursive: true });
        else fs.symlinkSync(outside, join(folder, 'docs'), 'junction');
      }
      return write(file, ...args);
    });
    run();
    expect(fs.statSync(join(folder, 'docs/nested')).isDirectory()).toBe(true);
    expect(fs.statSync(join(folder, 'preserved-docs/nested')).isDirectory()).toBe(true);
    expect(fs.statSync(join(outside, 'nested')).isDirectory()).toBe(true);
  },
);
