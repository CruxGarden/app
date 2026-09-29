import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { launchApp } from './launch';

// The server never finishes its oversized response. Admission must reject while
// receiving, release the connection, and leave the next ordinary request usable.
test('media download stops an oversized stream before completion and rejects invalid limits', async () => {
  let requests = 0;
  let streaming = 0;
  const cookies: string[] = [];
  const server = createServer((request, response) => {
    requests++;
    if (request.headers.cookie) cookies.push(request.headers.cookie);
    if (request.url === '/stream') {
      streaming++;
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      const timer = setInterval(() => response.write(Buffer.alloc(32, 65)), 10);
      response.on('close', () => {
        clearInterval(timer);
        streaming--;
      });
    } else if (request.url === '/gzip') {
      response.setHeader('Content-Encoding', 'gzip');
      response.end(gzipSync(Buffer.alloc(4096)));
    } else if (request.url === '/gzip-small') {
      response.setHeader('Content-Encoding', 'gzip');
      response.end(gzipSync(Buffer.from('small file')));
    } else if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/small' });
      response.end();
    } else if (request.url === '/outside') {
      response.writeHead(302, { Location: 'http://example.invalid/private' });
      response.end();
    } else if (request.url === '/broken') {
      response.writeHead(200, { 'Content-Length': '20' });
      response.write('partial');
      setImmediate(() => response.destroy());
    } else if (request.url === '/headers') {
      streaming++;
      response.on('close', () => streaming--);
      // Without nosniff Chromium waits for body bytes before exposing headers.
      response.writeHead(200, {
        'Content-Length': '1000',
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      response.flushHeaders();
    } else if (request.url === '/missing') {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
    } else if (request.url === '/stall') {
      response.writeHead(200);
      response.flushHeaders();
    } else {
      response.end('small file');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback listener');
  const base = `http://127.0.0.1:${address.port}`;
  const { app, page } = await launchApp();
  try {
    await app.evaluate(
      ({ session }, url) =>
        session.defaultSession.cookies.set({
          url,
          name: 'private-fixture',
          value: 'not-for-media',
        }),
      base,
    );
    const result = await page.evaluate(
      async (url) =>
        Promise.race([
          window.electronAPI!.media.fetch(url, { maxBytes: 64 }).then(
            () => 'accepted',
            (error) => String(error),
          ),
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('still waiting for end'), 2000),
          ),
        ]),
      base + '/stream',
    );
    expect.soft(result).toContain('limit');
    if (result === 'still waiting for end') server.closeAllConnections();
    await expect.poll(() => streaming).toBe(0);
    const before = requests;
    const invalid = await page.evaluate(async (url) => {
      const failures: string[] = [];
      for (const maxBytes of [NaN, Infinity, -1, 0, 1.5]) {
        try {
          await window.electronAPI!.media.fetch(url, { maxBytes });
          failures.push('accepted');
        } catch (error) {
          failures.push(String(error));
        }
      }
      return failures;
    }, base + '/small');
    expect.soft(invalid.every((message) => message.includes('limit'))).toBe(true);
    expect.soft(requests).toBe(before);
    const recovered = await page.evaluate(async (url) => {
      const result = await window.electronAPI!.media.fetch(url, { maxBytes: 10 });
      return { ok: result.ok, bytes: new TextDecoder().decode(result.bytes) };
    }, base + '/small');
    expect(recovered).toEqual({ ok: true, bytes: 'small file' });
    const boundaries = await page.evaluate(async (base) => {
      const api = window.electronAPI!.media;
      const refused: string[] = [];
      for (const path of ['/gzip', '/outside', '/broken', '/headers']) {
        try {
          await Promise.race([
            api.fetch(base + path, { maxBytes: 64 }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('fixture deadline: ' + path)), 3000),
            ),
          ]);
          refused.push('accepted');
        } catch (error) {
          refused.push(String(error));
        }
      }
      const missing = await api.fetch(base + '/missing', { maxBytes: 64 });
      const small = await api.fetch(base + '/gzip-small', { maxBytes: 10 });
      const redirected = await api.fetch(base + '/redirect', { maxBytes: 10 });
      return {
        refused,
        missing: { ok: missing.ok, status: missing.status, mimeType: missing.mimeType },
        redirected: new TextDecoder().decode(redirected.bytes),
        small: new TextDecoder().decode(small.bytes),
      };
    }, base);
    expect(boundaries.refused[0]).toContain('limit');
    expect(boundaries.refused[1]).toContain('https media');
    expect(boundaries.refused[2]).not.toBe('accepted');
    expect(boundaries.refused[2]).not.toContain('limit');
    expect(boundaries.refused[2]).not.toContain('fixture deadline');
    expect(boundaries.refused[3]).toContain('limit');
    expect(boundaries.missing).toEqual({ ok: false, status: 404, mimeType: 'text/plain' });
    await expect.poll(() => streaming).toBe(0);
    expect(boundaries.redirected).toBe('small file');
    expect(boundaries.small).toBe('small file');
    // Exercise the production deadline with the real Electron transport, using
    // a short internal timeout rather than adding a test knob to public IPC.
    const deadline = await app.evaluate(async ({ app }, url) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { downloadMedia } = load(
        './dist/media-download.js',
      ) as typeof import('../src/media-download');
      const { requestMedia } = load(
        './dist/media-transport.js',
      ) as typeof import('../src/media-transport');
      try {
        await downloadMedia(url, 64, requestMedia, 'Crux-owned-test', 100);
        return 'accepted';
      } catch (error) {
        return String(error);
      }
    }, base + '/stall');
    expect(deadline).toContain('time limit');
    expect(cookies).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  }
});
