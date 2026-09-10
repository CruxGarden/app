import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProjectFolders, DesktopConfig } =
  require('../dist/projects.js') as typeof import('../src/projects');

test('task capture excludes credentials and dependencies, preserves executable modes, and rejects symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crux-task-capture-'));
  try {
    const config = new DesktopConfig(root);
    config.setGardenRoot(root);
    const folders = new ProjectFolders(config);
    const folder = folders.createFolder('task');
    folders.writeFile(folder, 'src/index.html', new TextEncoder().encode('hello'));
    folders.writeFile(folder, 'run.sh', new TextEncoder().encode('#!/bin/sh\ntrue\n'));
    folders.setMode(folder, 'run.sh', 0o755);
    folders.writeFile(folder, '.env.local', new TextEncoder().encode('secret'));
    folders.writeFile(
      folder,
      'node_modules/dependency/index.js',
      new TextEncoder().encode('ignored'),
    );
    const captured = folders.capture(folder);
    expect(captured.map((f) => f.path).sort()).toEqual(['run.sh', 'src/index.html']);
    if (process.platform !== 'win32')
      expect(captured.find((f) => f.path === 'run.sh')!.mode).toBe(0o755);
    fs.symlinkSync(path.join(folder, 'src'), path.join(folder, 'linked'), 'dir');
    expect(() => folders.capture(folder)).toThrow(/symlink/);
    expect(() =>
      folders.writeFile(folder, 'linked/index.html', new TextEncoder().encode('wrong')),
    ).toThrow(/symlink/);
    expect(fs.readFileSync(path.join(folder, 'src/index.html'), 'utf8')).toBe('hello');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('atomic file replacement preserves the old content on failure and does not leak temporary files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crux-task-write-'));
  try {
    const config = new DesktopConfig(root);
    config.setGardenRoot(root);
    const folders = new ProjectFolders(config);
    const folder = folders.createFolder('task');
    folders.writeFile(folder, 'same.txt', new TextEncoder().encode('one'));
    folders.writeFile(folder, 'same.txt', new TextEncoder().encode('two'));
    expect(fs.readFileSync(path.join(folder, 'same.txt'), 'utf8')).toBe('two');
    expect(fs.readdirSync(folder)).toEqual(['same.txt']);
    fs.mkdirSync(path.join(folder, 'directory'));
    expect(() =>
      folders.writeFile(folder, 'directory', new TextEncoder().encode('invalid')),
    ).toThrow();
    expect(fs.statSync(path.join(folder, 'directory')).isDirectory()).toBe(true);
    expect(fs.readdirSync(folder).some((p) => p.includes('.crux-write-'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
