import { strict as assert } from 'node:assert';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { downloadMedia } from '../src/media-download';
test('downloads bound decoded bytes, deadlines, redirects and aggregate admission', async () => {
  const held = new Set<import('node:http').ServerResponse>();
  let openStreams = 0;
  const server = createServer((req, res) => {
    if (req.url === '/stream') {
      openStreams++;
      const timer = setInterval(() => res.write(Buffer.alloc(32)), 10);
      res.on('close', () => {
        clearInterval(timer);
        openStreams--;
      });
    } else if (req.url === '/gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(Buffer.alloc(4096)));
    } else if (req.url === '/gzip-small') {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(Buffer.from('small file')));
    } else if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/small' });
      res.end();
    } else if (req.url === '/bad') {
      res.writeHead(302, { Location: 'http://example.invalid/private' });
      res.end();
    } else if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    } else if (req.url === '/hold') {
      held.add(res);
      res.on('close', () => held.delete(res));
      res.writeHead(200);
      res.flushHeaders();
    } else {
      res.end('small file');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const get = (path: string, cap = 64, timeout = 2000) =>
    downloadMedia(
      base + path,
      cap,
      (url, options) => fetch(url, { ...options, redirect: 'manual', credentials: 'omit' }),
      'Crux-owned-test',
      timeout,
    );
  try {
    await assert.rejects(get('/stream'), /limit/);
    await expect.poll(() => openStreams).toBe(0);
    await assert.rejects(get('/gzip'), /limit/);
    assert.equal((await get('/gzip-small', 10)).bytes.toString(), 'small file');
    assert.equal((await get('/redirect', 10)).bytes.toString(), 'small file');
    await assert.rejects(get('/bad'), /https media/);
    await assert.rejects(get('/loop'), /redirect limit/);
    await assert.rejects(get('/hold', 64, 100), /time limit/);
    await expect.poll(() => held.size).toBe(0);
    const first = get('/hold', 512_000_000);
    await expect.poll(() => held.size).toBe(1);
    await assert.rejects(get('/small'), /busy/);
    for (const response of held) response.end('small file');
    await first;
    const concurrent = Array.from({ length: 4 }, () => get('/hold', 10));
    await expect.poll(() => held.size).toBe(4);
    await assert.rejects(get('/small', 10), /busy/);
    for (const response of held) response.end('small file');
    await Promise.all(concurrent);
    for (const cap of [NaN, Infinity, -1, 0, 1.5, 512_000_001])
      await assert.rejects(get('/small', cap), /limit/);
    assert.equal((await get('/small', 10)).bytes.toString(), 'small file');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
