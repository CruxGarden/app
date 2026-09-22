import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const { DesktopConfig, ProjectFolders } =
  require('../dist/projects.js') as typeof import('../src/projects');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'crux-paths-recovery-'));
  const config = new DesktopConfig(root);
  config.setGardenRoot(join(root, 'garden'));
  const projects = new ProjectFolders(config);
  return { root, projects, folder: projects.createFolder('example') };
}

test('startup reconciliation reports changed/new/deleted files without writing to disk', () => {
  const { root, projects, folder } = fixture();
  try {
    writeFileSync(join(folder, 'changed.txt'), 'new');
    writeFileSync(join(folder, 'same.txt'), 'same');
    writeFileSync(join(folder, 'added.txt'), 'added');
    expect(
      projects.reconcile(folder, [
        { path: 'changed.txt', fingerprint: hash('old') },
        { path: 'same.txt', fingerprint: hash('same') },
        { path: 'deleted.txt', fingerprint: hash('deleted') },
      ]),
    ).toEqual({
      folder,
      events: [
        { type: 'write', relPath: 'added.txt', own: false },
        { type: 'write', relPath: 'changed.txt', own: false },
        { type: 'delete', relPath: 'deleted.txt' },
      ],
    });
    expect(readFileSync(join(folder, 'changed.txt'), 'utf8')).toBe('new');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing Project Folder preserves all indexed artifacts', () => {
  const { root, projects, folder } = fixture();
  try {
    rmSync(folder, { recursive: true });
    expect(
      projects.reconcile(folder, [{ path: 'important.txt', fingerprint: hash('work') }]),
    ).toEqual({ folder, folderMissing: true, events: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignored and interrupted-write files are excluded without deleting ignored index entries', () => {
  const { root, projects, folder } = fixture();
  try {
    mkdirSync(join(folder, '.crux'));
    writeFileSync(join(folder, '.crux', 'mcp.json'), 'private');
    writeFileSync(join(folder, 'note.txt.crux-write-aborted'), 'partial');
    writeFileSync(join(folder, '.cruxignore'), 'private/\n');
    const result = projects.reconcile(folder, [
      { path: 'dist/old.html', fingerprint: hash('old build') },
      { path: 'private/missing.txt', fingerprint: hash('private') },
    ]);
    expect(result.events).toEqual([{ type: 'write', relPath: '.cruxignore', own: false }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an indexed path replaced with an outside symlink is refused, never read or deleted', () => {
  const { root, projects, folder } = fixture();
  try {
    const outside = join(root, 'outside.txt');
    writeFileSync(outside, 'private');
    symlinkSync(outside, join(folder, 'note.txt'));
    expect(() =>
      projects.reconcile(folder, [{ path: 'note.txt', fingerprint: hash('old') }]),
    ).toThrow();
    expect(readFileSync(outside, 'utf8')).toBe('private');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
