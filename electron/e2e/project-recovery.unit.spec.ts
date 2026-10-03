import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { FileWriteIntent } from '@cruxgarden/local-api';
const { ProjectRecovery } =
  require('../dist/project-recovery.js') as typeof import('../src/project-recovery');
const { projectFileOperation } =
  require('../dist/project-file-operation.js') as typeof import('../src/project-file-operation');

function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-maintenance-'));
  const folder = join(root, 'project');
  const trash = join(root, 'trash');
  fs.mkdirSync(folder);
  fs.mkdirSync(trash);
  const target = join(folder, 'target.txt');
  fs.writeFileSync(target, 'Original');
  const entry = (text: string) => ({
    id: randomUUID(),
    path: 'target.txt',
    fingerprint: createHash('sha256').update(text).digest('hex'),
    size: Buffer.byteLength(text),
    mode: 0o644,
    mimeType: 'text/plain',
    encoding: 'utf-8' as const,
    attributes: {},
  });
  const intent: FileWriteIntent = {
    kind: 'write',
    operationId: randomUUID(),
    before: entry('Original'),
    entry: entry('Replacement'),
  };
  const stage = join(folder, '.crux-recovery', 'write', intent.operationId);
  const recovery = new ProjectRecovery((selected) => {
    if (selected !== folder) throw new Error('Unregistered');
    return folder;
  });
  const apply = () =>
    projectFileOperation(folder, target, intent, true, Buffer.from('Replacement'));
  const move = async (file: string) => fs.renameSync(file, join(trash, basename(file)));
  return { root, folder, target, intent, stage, recovery, apply, move, trash };
}

test('review counts hardlinked bytes once and cleanup preserves live files, receipts and replay', async () => {
  const f = fixture();
  try {
    f.apply();
    const summary = f.recovery.overview([f.folder]);
    // Original has two retained names; replacement is also the live file.
    const metadata =
      fs.statSync(join(f.stage, 'README.txt')).size +
      fs.statSync(join(f.stage, 'completed.json')).size;
    expect(summary.bytes).toBe(Buffer.byteLength('OriginalReplacement') + metadata);
    const [selection] = summary.operations;
    expect(selection.reason).toBeNull();
    await f.recovery.trash(selection, f.move);
    expect(fs.readdirSync(f.stage).sort()).toEqual(['README.txt', 'completed.json']);
    expect(fs.readFileSync(f.target, 'utf8')).toBe('Replacement');
    expect(fs.readFileSync(join(f.trash, 'original'), 'utf8')).toBe('Original');
    fs.writeFileSync(f.target, 'Later work');
    f.apply();
    expect(fs.readFileSync(f.target, 'utf8')).toBe('Later work');
    expect(f.recovery.overview([f.folder]).operations[0].hasPayload).toBe(false);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('an external editor invalidates consent, including a write while OS Trash is pending', async () => {
  const f = fixture();
  const fd = fs.openSync(f.target, 'r+');
  try {
    f.apply();
    const selected = f.recovery.overview([f.folder]).operations[0];
    fs.writeSync(fd, 'External work', 0);
    await expect(f.recovery.trash(selected, f.move)).rejects.toThrow(/changed/);
    expect(fs.readdirSync(f.trash)).toEqual([]);
    const refreshed = f.recovery.overview([f.folder]).operations[0];
    // Windows refuses moving a directory containing this open handle before
    // our between-moves revalidation runs. Assert that stronger OS refusal;
    // the separate pending-write case below covers revalidation on every OS.
    if (process.platform === 'win32') {
      await expect(f.recovery.trash(refreshed, f.move)).rejects.toThrow(/EPERM|EBUSY|EACCES/);
      expect(fs.readdirSync(f.trash)).toEqual([]);
      expect(fs.readFileSync(join(f.stage, 'original'), 'utf8')).toBe('External work');
      expect(fs.readFileSync(f.target, 'utf8')).toBe('Replacement');
      return;
    }
    let moves = 0;
    await expect(
      f.recovery.trash(refreshed, async (file) => {
        await f.move(file);
        moves++;
        fs.writeSync(fd, 'New external bytes', 0);
      }),
    ).rejects.toThrow(/changed/);
    expect(moves).toBe(1);
    expect(fs.readFileSync(join(f.stage, 'original'), 'utf8')).toBe('New external bytes');
    expect(fs.readFileSync(f.target, 'utf8')).toBe('Replacement');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('a concurrent file write while OS Trash is pending forces a fresh review on every platform', async () => {
  const f = fixture();
  try {
    f.apply();
    const selected = f.recovery.overview([f.folder]).operations[0];
    let moves = 0;
    await expect(
      f.recovery.trash(selected, async (file) => {
        await f.move(file);
        moves++;
        fs.writeFileSync(join(f.stage, 'original'), 'Concurrent external bytes');
      }),
    ).rejects.toThrow(/changed/);
    expect(moves).toBe(1);
    expect(fs.readFileSync(join(f.stage, 'original'), 'utf8')).toBe('Concurrent external bytes');
    expect(fs.readFileSync(f.target, 'utf8')).toBe('Replacement');
    expect(fs.existsSync(join(f.stage, 'completed.json'))).toBe(true);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('unfinished receipts, unknown files, links and unregistered folders cannot be cleaned', async () => {
  const f = fixture();
  try {
    f.apply();
    const completed = fs.readFileSync(join(f.stage, 'completed.json'));
    fs.unlinkSync(join(f.stage, 'completed.json'));
    let selection = f.recovery.overview([f.folder]).operations[0];
    expect(selection.reason).toMatch(/Unfinished/);
    await expect(f.recovery.trash(selection, f.move)).rejects.toThrow(/Unfinished/);
    fs.writeFileSync(join(f.stage, 'completed.json'), completed);
    fs.writeFileSync(join(f.stage, 'valuable-extra'), 'Keep me');
    selection = f.recovery.overview([f.folder]).operations[0];
    await expect(f.recovery.trash(selection, f.move)).rejects.toThrow(/Unrecognized/);
    fs.unlinkSync(join(f.stage, 'valuable-extra'));
    // Directory links work without symlink privilege on Windows.
    fs.symlinkSync(
      f.trash,
      join(f.stage, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(f.recovery.overview([f.folder]).warnings.join()).toMatch(/link/);
    expect(() => f.recovery.reveal(f.root, 'write', f.intent.operationId)).toThrow(/Unregistered/);
    expect(fs.readdirSync(f.trash)).toEqual([]);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('OS refusal after a partial move retains the receipt and allows a reviewed retry', async () => {
  const f = fixture();
  try {
    f.apply();
    let attempts = 0;
    await expect(
      f.recovery.trash(f.recovery.overview([f.folder]).operations[0], async (file) => {
        if (++attempts === 2)
          throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
        await f.move(file);
      }),
    ).rejects.toThrow(/ENOSPC/);
    expect(fs.existsSync(join(f.stage, 'completed.json'))).toBe(true);
    expect(fs.readFileSync(f.target, 'utf8')).toBe('Replacement');
    await f.recovery.trash(f.recovery.overview([f.folder]).operations[0], f.move);
    expect(fs.readdirSync(f.stage).sort()).toEqual(['README.txt', 'completed.json']);
    f.apply();
    expect(fs.readFileSync(f.target, 'utf8')).toBe('Replacement');
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('repeated multi-megabyte saves count shared revisions once across operations', () => {
  const f = fixture();
  try {
    let before = f.intent.before;
    let bytes = 8;
    for (let i = 0; i < 12; i++) {
      const content = Buffer.alloc(2 * 1024 * 1024, 65 + i);
      const entry = {
        ...f.intent.entry,
        fingerprint: createHash('sha256').update(content).digest('hex'),
        size: content.length,
      };
      projectFileOperation(
        f.folder,
        f.target,
        { kind: 'write', operationId: randomUUID(), before, entry },
        true,
        content,
      );
      before = entry;
      bytes += content.length;
    }
    const overview = f.recovery.overview([f.folder]);
    expect(overview.operations).toHaveLength(12);
    const metadata = overview.operations.reduce((total, op) => {
      const stage = join(f.folder, '.crux-recovery', op.kind, op.id);
      return (
        total +
        fs.statSync(join(stage, 'README.txt')).size +
        fs.statSync(join(stage, 'completed.json')).size
      );
    }, 0);
    expect(overview.bytes).toBe(bytes + metadata);
    expect(fs.readFileSync(f.target)).toEqual(Buffer.alloc(2 * 1024 * 1024, 76));
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('an unavailable registered folder is reported instead of looking empty', () => {
  const f = fixture();
  try {
    fs.renameSync(f.folder, f.folder + '-moved');
    const overview = f.recovery.overview([f.folder]);
    expect(overview.operations).toEqual([]);
    expect(overview.warnings.join()).toContain('Project Folder is unavailable');
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
