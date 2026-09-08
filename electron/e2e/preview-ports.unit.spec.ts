import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PreviewServer } =
  require('../dist/preview-server.js') as typeof import('../src/preview-server');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DevServerManager } = require('../dist/dev-server.js') as typeof import('../src/dev-server');
const hook = resolve(__dirname, '../dist/dev-listener.js');
function launch(cwd: string, port: number, readyFile: string, token: string) {
  const code = `const h=require('http'); const s=h.createServer((q,r)=>r.end(${JSON.stringify(cwd)})); s.listen(${port},'127.0.0.1');`;
  return spawn(process.execPath, ['--require', hook, '-e', code], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CRUX_PREVIEW_READY_FILE: readyFile, CRUX_PREVIEW_READY_TOKEN: token },
  });
}
async function availablePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
test('concurrent static starts deduplicate one folder and isolate different folders', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crux-port-test-'));
  const a = join(root, 'A'),
    b = join(root, 'B');
  mkdirSync(a);
  mkdirSync(b);
  writeFileSync(join(a, 'index.html'), 'A sentinel');
  writeFileSync(join(b, 'index.html'), 'B sentinel');
  const manager = new PreviewServer((f) => resolve(f));
  try {
    const [ua, ua2, ub] = await Promise.all([manager.start(a), manager.start(a), manager.start(b)]);
    expect(ua).toBe(ua2);
    expect(new URL(ua).port).not.toBe(new URL(ub).port);
    expect(await (await fetch(ua)).text()).toBe('A sentinel');
    expect(await (await fetch(ub)).text()).toBe('B sentinel');
    await manager.stop(a);
    expect(await (await fetch(ub)).text()).toBe('B sentinel');
    await expect(fetch(ua)).rejects.toThrow();
  } finally {
    await manager.stopAll();
    rmSync(root, { recursive: true, force: true });
  }
});
test('simultaneous dev requests for the same preferred port get distinct owned endpoints', async () => {
  const preferred = await availablePort();
  let spawned = 0;
  const manager = new DevServerManager(
    (f) => f,
    undefined,
    (...args) => {
      spawned++;
      return launch(...args);
    },
  );
  try {
    const [a, again, b] = await Promise.all([
      manager.start('A', { port: preferred }),
      manager.start('A', { port: preferred }),
      manager.start('B', { port: preferred }),
    ]);
    expect(a).toBe(again);
    expect(a).not.toBe(b);
    expect(spawned).toBe(2);
    expect(await (await fetch(a)).text()).toBe('A');
    expect(await (await fetch(b)).text()).toBe('B');
    await manager.stop('A');
    expect(await (await fetch(b)).text()).toBe('B');
  } finally {
    await manager.stopAll();
  }
});
test('a mixed static/dev collision falls back and never changes the static server', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crux-port-test-'));
  writeFileSync(join(root, 'index.html'), 'static A');
  const statics = new PreviewServer((f) => f);
  const devs = new DevServerManager((f) => f, undefined, launch);
  try {
    const a = await statics.start(root);
    const b = await devs.start('B', { port: Number(new URL(a).port) });
    expect(b).not.toBe(a);
    expect(await (await fetch(a)).text()).toBe('static A');
    expect(await (await fetch(b)).text()).toBe('B');
  } finally {
    await statics.stopAll();
    await devs.stopAll();
    rmSync(root, { recursive: true, force: true });
  }
});
test('an unrelated HTTP success is not readiness for a child that never binds', async () => {
  const external = createServer((_q, r) => r.end('unrelated success'));
  let candidate = 0;
  const manager = new DevServerManager(
    (f) => f,
    undefined,
    (_cwd, port) => {
      candidate = port;
      external.listen(port, '127.0.0.1');
      return spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    },
  );
  try {
    await expect(manager.start('A', { timeoutMs: 900 })).rejects.toThrow('did not become ready');
    expect(await (await fetch(`http://127.0.0.1:${candidate}`)).text()).toBe('unrelated success');
  } finally {
    await manager.stopAll();
    await new Promise<void>((r) => external.close(() => r()));
  }
});
test('the actual child-bound port is used if the tool chooses another port', async () => {
  const manager = new DevServerManager(
    (f) => f,
    undefined,
    (cwd, _requested, file, token) => launch(cwd, 0, file, token),
  );
  try {
    const url = await manager.start('A');
    expect(await (await fetch(url)).text()).toBe('A');
  } finally {
    await manager.stopAll();
  }
});
test('restart isolates B and a start immediately followed by stop drains without deadlock', async () => {
  const manager = new DevServerManager((f) => f, undefined, launch);
  try {
    const [a, b] = await Promise.all([manager.start('A'), manager.start('B')]);
    const a2 = await manager.restart('A');
    expect(await (await fetch(a2)).text()).toBe('A');
    expect(await (await fetch(b)).text()).toBe('B');
    const c = manager.start('C');
    const interrupted = expect(c).rejects.toThrow();
    const stopped = manager.stop('C');
    await interrupted;
    await stopped;
    expect(manager.status('C').status).toBe('idle');
    expect(manager.status('B').url).toBe(b);
    expect(a).toContain('127.0.0.1');
  } finally {
    await manager.stopAll();
  }
});

test('stop cancels a startup that never binds without waiting for the readiness timeout', async () => {
  const manager = new DevServerManager(
    (f) => f,
    undefined,
    () =>
      spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
  );
  const start = manager.start('never-ready', { timeoutMs: 60000 });
  const rejected = expect(start).rejects.toThrow();
  await manager.stop('never-ready');
  await rejected;
  expect(manager.status('never-ready').status).toBe('idle');
});
