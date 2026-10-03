import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const { LocalStaging } = require('../dist/local-staging') as typeof import('../src/local-staging');

test('local publication is a saved visitor snapshot that survives restart and a refused replacement', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crux-staging-unit-'));
  let garden = new LocalStaging(root);
  const id = randomUUID();
  const files = [{ path: 'index.html', data: new Uint8Array(Buffer.from('<h1>First page</h1>')) }];
  try {
    const first = await garden.publish({ id, title: 'My home', files });
    expect(await (await fetch(first.url)).text()).toContain('First page');
    files[0].data.fill(0);
    expect(await (await fetch(first.url)).text()).toContain('First page');
    await expect(
      garden.publish({
        id,
        title: 'Broken',
        files: [{ path: '../outside.html', data: new Uint8Array([1]) }],
      }),
    ).rejects.toThrow();
    expect(await (await fetch((await garden.list())[0].url)).text()).toContain('First page');
    // A filesystem refusal after a file has already been written cannot replace the pointer.
    await expect(
      garden.publish({
        id,
        title: 'Partial',
        files: [
          { path: 'index.html', data: new Uint8Array(Buffer.from('Incomplete')) },
          { path: 'nested', data: new Uint8Array([1]) },
          { path: 'nested/file.txt', data: new Uint8Array([2]) },
        ],
      }),
    ).rejects.toThrow();
    expect(await (await fetch((await garden.list())[0].url)).text()).toContain('First page');
    await garden.close();
    garden = new LocalStaging(root);
    const restored = (await garden.list())[0];
    expect(restored.title).toBe('My home');
    expect(await (await fetch(restored.url)).text()).toContain('First page');
    const updated = await garden.publish({
      id,
      title: 'Updated home',
      files: [{ path: 'index.html', data: new Uint8Array(Buffer.from('<h1>Replacement</h1>')) }],
    });
    expect(updated.url).toBe(restored.url);
    expect(await (await fetch(restored.url)).text()).toContain('Replacement');
    await garden.remove(id);
    await expect(fetch(restored.url)).rejects.toThrow();
    expect(await garden.list()).toEqual([]);
  } finally {
    await garden.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('the local test Garden isolates sites, escapes titles, refuses private paths and does not run hosted submissions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crux-staging-unit-'));
  const garden = new LocalStaging(root);
  const id = randomUUID();
  const html = new Uint8Array(Buffer.from('<h1>Visitor edition</h1>'));
  try {
    const one = await garden.publish({
      id,
      title: '<script>bad()</script>',
      files: [{ path: 'index.html', data: html }],
    });
    const two = await garden.publish({
      id: randomUUID(),
      title: 'Other',
      files: [{ path: 'index.html', data: html }],
    });
    expect(new URL(one.url).origin).not.toBe(new URL(two.url).origin);
    const response = await fetch(one.url);
    expect(response.headers.get('content-security-policy')).toContain("form-action 'none'");
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'");
    expect((await fetch(one.url, { method: 'POST', body: 'test submission' })).status).toBe(405);
    for (const name of [
      '.env',
      'nested/.env',
      'secret.key',
      '/outside',
      'a\\b',
      'x/../index.html',
    ]) {
      await expect(
        garden.publish({
          id,
          title: 'No',
          files: [
            { path: 'index.html', data: html },
            { path: name, data: html },
          ],
        }),
      ).rejects.toThrow();
    }
    await expect(
      garden.publish({
        id,
        title: 'No',
        files: [
          { path: 'index.html', data: html },
          { path: 'INDEX.html', data: html },
        ],
      }),
    ).rejects.toThrow();
    const [url, duplicate] = await Promise.all([garden.openGarden(), garden.openGarden()]);
    expect(url).toBe(duplicate);
    expect(new URL(url).origin).not.toBe(new URL(one.url).origin);
    const gallery = await (await fetch(url)).text();
    expect(gallery).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(gallery).not.toContain('<script>');
    expect(gallery).toContain('ON THIS COMPUTER');
    expect(gallery).toContain(one.url);
  } finally {
    await garden.close();
    rmSync(root, { recursive: true, force: true });
  }
});
