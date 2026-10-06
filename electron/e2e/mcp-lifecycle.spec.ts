import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { AgentHost, mcpConfigPath } =
  require('../dist/mcp-server.js') as typeof import('../src/mcp-server');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('an agent connection waits for its Crux lookup before opening the captured folder', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-host-lookup-'));
  const lookup = deferred<{ slug: string; title: string; folder: string }>();
  const host = new AgentHost({
    lookupCrux: () => lookup.promise,
    resolveKnownFolder: (value) => {
      expect(value).toBe(folder);
      return value;
    },
    sendToRenderer: () => false,
    onChanged: () => {},
    stdioScript: resolve(__dirname, '../dist/mcp-stdio.js'),
    version: 'test',
    log: () => {},
  });
  try {
    const started = host.enable('original-crux');
    const pending = started.then(
      () => 'started',
      (error) => String(error),
    );
    await new Promise<void>((done) => setImmediate(done));
    expect(host.list()).toEqual([]);
    expect(existsSync(mcpConfigPath(folder))).toBe(false);
    lookup.resolve({ slug: 'original', title: 'Original Crux', folder });
    expect(await pending).toBe('started');
    expect(host.list()).toMatchObject([{ cruxId: 'original-crux', name: 'Original Crux' }]);
    expect(existsSync(mcpConfigPath(folder))).toBe(true);
  } finally {
    await host.stopAll();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('shutdown drains an admitted lookup and leaves no late agent server running', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-host-stop-'));
  const lookup = deferred<{ slug: string; title: string; folder: string }>();
  const host = new AgentHost({
    lookupCrux: () => lookup.promise,
    resolveKnownFolder: (value) => value,
    sendToRenderer: () => false,
    onChanged: () => {},
    stdioScript: resolve(__dirname, '../dist/mcp-stdio.js'),
    version: 'test',
    log: () => {},
  });
  try {
    const starting = host.enable('original-crux');
    const stopping = host.stopAll();
    lookup.resolve({ slug: 'original', title: 'Original Crux', folder });
    await starting;
    await stopping;
    expect(host.list()).toEqual([]);
    await expect(host.enable('late-crux')).rejects.toThrow('shutting down');
  } finally {
    await host.stopAll();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a failed lookup does not poison later enable and disable requests', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-host-retry-'));
  const host = new AgentHost({
    lookupCrux: async (id) => {
      if (id === 'missing') throw new Error('API unavailable');
      return { slug: 'original', title: 'Original Crux', folder };
    },
    resolveKnownFolder: (value) => value,
    sendToRenderer: () => false,
    onChanged: () => {},
    stdioScript: resolve(__dirname, '../dist/mcp-stdio.js'),
    version: 'test',
    log: () => {},
  });
  try {
    await expect(host.enable('missing')).rejects.toThrow('API unavailable');
    const starting = host.enable('original-crux');
    const disabling = host.disable('original-crux');
    await starting;
    await disabling;
    expect(host.list()).toEqual([]);
    expect(existsSync(mcpConfigPath(folder))).toBe(false);
    await host.enable('original-crux');
    expect(host.list()).toHaveLength(1);
  } finally {
    await host.stopAll();
    rmSync(folder, { recursive: true, force: true });
  }
});
