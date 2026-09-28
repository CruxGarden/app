import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readLocal, writeLocal, inspectCompose, LOCAL_ENV, LOCAL_COMPOSE } =
  require('../dist/containers.js') as typeof import('../src/containers');

test('container configuration reads and writes stay inside the Project Folder', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'crux-container-paths-'));
  const folder = join(scratch, 'project');
  mkdirSync(folder);
  const outside = join(scratch, 'outside.yaml');
  writeFileSync(outside, 'services:\n  private-service:\n    image: secret\n');
  try {
    expect.soft(() => readLocal(folder, '../outside.yaml')).toThrow();
    expect.soft(() => inspectCompose(folder, '../outside.yaml')).toThrow();
    writeLocal(folder, LOCAL_ENV, 'PORT=8080');
    expect(readLocal(folder, LOCAL_ENV)).toBe('PORT=8080\n');
    expect(readLocal(folder, LOCAL_COMPOSE)).toBe('');
    symlinkSync(outside, join(folder, LOCAL_COMPOSE));
    expect.soft(() => readLocal(folder, LOCAL_COMPOSE)).toThrow();
    expect.soft(() => writeLocal(folder, LOCAL_COMPOSE, 'replacement')).toThrow();
    expect.soft(() => inspectCompose(folder, LOCAL_COMPOSE)).toThrow();
    expect(readFileSync(outside, 'utf8')).toContain('private-service');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
