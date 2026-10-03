import { test, expect } from '@playwright/test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const { DesktopConfig, ProjectFolders } =
  require('../dist/projects.js') as typeof import('../src/projects');
const { PreviewServer } =
  require('../dist/preview-server.js') as typeof import('../src/preview-server');
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

test('a Garden root and an unrelated sibling directory are not Project Folders', () => {
  const { root, projects, folder } = fixture();
  try {
    const garden = join(root, 'garden');
    const unrelated = join(garden, 'personal');
    mkdirSync(unrelated);
    writeFileSync(join(unrelated, 'private.txt'), 'untouched');
    expect(() => projects.writeFile(garden, 'root.txt', Buffer.from('wrong'))).toThrow();
    expect(() => projects.writeFile(unrelated, 'private.txt', Buffer.from('wrong'))).toThrow();
    expect(() => projects.readFile(unrelated, 'private.txt')).toThrow();
    expect(() => projects.resolveKnownFolder(unrelated)).toThrow();
    projects.writeFile(folder, 'owned.txt', Buffer.from('allowed'));
    expect(readFileSync(join(unrelated, 'private.txt'), 'utf8')).toBe('untouched');
    expect(readFileSync(join(folder, 'owned.txt'), 'utf8')).toBe('allowed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('changing roots retains explicit projects, not arbitrary old directories, and registrations survive restart', () => {
  const { root, projects, folder } = fixture();
  try {
    const config = new DesktopConfig(root);
    config.setGardenRoot(join(root, 'garden', 'next'));
    const restarted = new ProjectFolders(config);
    expect(() => restarted.writeFile(folder, 'note.txt', Buffer.from('unregistered'))).toThrow();
    restarted.registerFolder(folder); // The host reloads committed Crux registrations, not directories.
    restarted.writeFile(folder, 'note.txt', Buffer.from('preserved'));
    const next = restarted.createFolder('next-project');
    restarted.writeFile(next, 'note.txt', Buffer.from('new'));
    expect(() => restarted.registerFolder(join(root, 'garden'))).toThrow();
    expect(() => restarted.registerFolder(config.gardenRoot)).toThrow();
    expect(() => restarted.ensureFolder(join(root, 'garden', 'unrelated'))).toThrow();
    expect(readFileSync(join(folder, 'note.txt'), 'utf8')).toBe('preserved');
    expect(projects.readFile(folder, 'note.txt').length).toBeGreaterThan(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing a registered directory with a link revokes file access and its running preview', async () => {
  const { root, projects, folder } = fixture();
  const preview = new PreviewServer((folder) => projects.resolveKnownFolder(folder));
  try {
    projects.writeFile(folder, 'index.html', Buffer.from('owned'));
    const url = await preview.start(folder);
    expect(await (await fetch(url)).text()).toBe('owned');
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'index.html'), 'private');
    // The HTTP body may arrive before the file stream closes its Windows handle.
    await expect(() => renameSync(folder, folder + '-saved')).toPass({ timeout: 5000 });
    symlinkSync(outside, folder, 'dir');
    expect(() => projects.readFile(folder, 'index.html')).toThrow();
    expect(() => projects.writeFile(folder, 'index.html', Buffer.from('wrong'))).toThrow();
    expect((await fetch(url)).status).toBe(403);
    expect(readFileSync(join(outside, 'index.html'), 'utf8')).toBe('private');
  } finally {
    await preview.stopAll();
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

test('rename recovery is inside the exact folder grant and never enters scans despite negation', async () => {
  const { root, projects, folder } = fixture();
  const { randomUUID } = require('node:crypto');
  const { scanFolder } = require('../dist/folder-scan');
  const preview = new PreviewServer((folder) => projects.resolveKnownFolder(folder));
  try {
    const source = {
      id: randomUUID(),
      path: 'source.txt',
      fingerprint: hash('Source'),
      size: 6,
      mimeType: 'text/plain',
      encoding: 'utf-8',
      mode: 0o644,
      attributes: {},
    };
    const target = { ...source, id: randomUUID(), path: 'target.txt', fingerprint: hash('Target') };
    const intent = {
      kind: 'rename' as const,
      operationId: randomUUID(),
      source,
      target,
      entry: { ...source, path: 'target.txt' },
    };
    projects.writeFile(folder, source.path, Buffer.from('Source'));
    projects.writeFile(folder, target.path, Buffer.from('Target'));
    projects.projectRename(folder, intent, false);
    projects.projectRename(folder, intent, true);
    const recovery = `.crux-recovery/rename/${intent.operationId}/target`;
    expect(readFileSync(join(folder, recovery), 'utf8')).toBe('Target');
    expect(() => projects.projectRename(join(root, 'garden'), intent, false)).toThrow(/registered/);
    expect(() => projects.readFile(folder, recovery)).toThrow(/reserved/);
    writeFileSync(join(folder, '.cruxignore'), '!.crux-recovery/\n!.crux-recovery/**\n');
    expect(projects.listFiles(folder)).toEqual(['.cruxignore', 'target.txt']);
    expect(projects.capture(folder).map((file) => file.path)).toEqual([
      '.cruxignore',
      'target.txt',
    ]);
    expect(
      (await projects.captureManifest(folder, join(root, 'blobs'), [])).files.map(
        (file) => file.path,
      ),
    ).toEqual(['.cruxignore', 'target.txt']);
    expect(projects.ignoredPaths(folder, [recovery])).toEqual([recovery]);
    expect(scanFolder(folder).files).toEqual(['.cruxignore', 'target.txt']);
    const url = await preview.start(folder);
    expect((await fetch(new URL(recovery, url))).status).toBe(403);
  } finally {
    await preview.stopAll();
    rmSync(root, { recursive: true, force: true });
  }
});

for (const kind of ['write', 'delete'] as const) {
  test(`${kind} recovery preserves folder grants and remains private to scans and preview`, async () => {
    const { root, projects, folder } = fixture();
    const { randomUUID } = require('node:crypto');
    const { scanFolder } = require('../dist/folder-scan');
    const preview = new PreviewServer((folder) => projects.resolveKnownFolder(folder));
    try {
      const original = {
        id: randomUUID(),
        path: 'target.txt',
        fingerprint: hash('Original'),
        size: 8,
        mode: 0o644,
        mimeType: 'text/plain',
        encoding: 'utf-8',
        attributes: {},
      };
      const intent =
        kind === 'write'
          ? {
              kind,
              operationId: randomUUID(),
              before: original,
              entry: { ...original, fingerprint: hash('Replacement'), size: 11 },
            }
          : { kind, operationId: randomUUID(), source: original };
      projects.writeFile(folder, 'target.txt', Buffer.from('Original'));
      expect(() => projects.projectOperation(join(root, 'garden'), intent, false)).toThrow(
        /registered/,
      );
      projects.projectOperation(folder, intent, false);
      expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Original');
      projects.projectOperation(folder, intent, true, Buffer.from('Replacement'));
      const recovery = `.crux-recovery/${kind}/${intent.operationId}/original`;
      expect(readFileSync(join(folder, recovery), 'utf8')).toBe('Original');
      expect(() => projects.readFile(folder, recovery)).toThrow(/reserved/);
      writeFileSync(join(folder, '.cruxignore'), '!.crux-recovery/\n!.crux-recovery/**\n');
      const expected = kind === 'write' ? ['.cruxignore', 'target.txt'] : ['.cruxignore'];
      expect(projects.listFiles(folder)).toEqual(expected);
      expect(projects.capture(folder).map((file) => file.path)).toEqual(expected);
      expect(
        (await projects.captureManifest(folder, join(root, 'blobs'), [])).files.map(
          (file) => file.path,
        ),
      ).toEqual(expected);
      expect(projects.ignoredPaths(folder, [recovery])).toEqual([recovery]);
      expect(scanFolder(folder).files).toEqual(expected);
      const url = await preview.start(folder);
      expect((await fetch(new URL(recovery, url))).status).toBe(403);
    } finally {
      await preview.stopAll();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
