import { test, expect } from '@playwright/test';
import { createServer, type Socket } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { createCrux, enterGarden, storedCrux } from './multi-crux-helpers';

test('Typst refuses dynamic package downloads while local includes and Make PDF still work', async () => {
  // A nonforwarding fixture catches the old compiler's download attempts. Even
  // the failing regression cannot reach a public package server.
  let requests = 0;
  const sockets = new Set<Socket>();
  const proxy = createServer((socket) => {
    requests++;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('No fixture proxy');
  const url = `http://127.0.0.1:${address.port}`;
  const { app, page } = await launchApp({
    env: {
      HTTP_PROXY: url,
      http_proxy: url,
      HTTPS_PROXY: url,
      https_proxy: url,
      ALL_PROXY: url,
      all_proxy: url,
      NO_PROXY: '',
      no_proxy: '',
    },
  });
  try {
    const tools = await page.evaluate(() => window.electronAPI!.native.tools());
    test.skip(!tools.some((tool) => tool.tool === 'typst' && tool.path), 'Typst is unavailable');
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Offline document');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    writeFileSync(join(folder, 'package.txt'), '@preview/crux-offline-fixture:0.0.0');
    writeFileSync(
      join(folder, 'remote.typ'),
      '#let package = read("package.txt").trim()\n#import package: *',
    );
    writeFileSync(join(folder, 'preserved.pdf'), 'Previous PDF bytes.');
    const refused = await page.evaluate(
      (cruxId) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'typst',
          args: ['compile', 'remote.typ', 'preserved.pdf'],
        }),
      cruxId,
    );
    expect.soft(refused.code).not.toBe(0);
    expect.soft(refused.stderrTail).toContain('package downloads are disabled');
    expect.soft(requests).toBe(0);
    expect(readFileSync(join(folder, 'preserved.pdf'), 'utf8')).toBe('Previous PDF bytes.');
    writeFileSync(join(folder, 'large.typ'), '#for i in range(10000) [#lorem(100) #pagebreak()]');
    const deadline = await app.evaluate(
      async ({ app }, { folder, binary }) => {
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { compileTypstPdf } = load(
          './dist/typst-command.js',
        ) as typeof import('../src/typst-command');
        return compileTypstPdf(binary, folder, 'large.typ', 'preserved.pdf', 500);
      },
      { folder, binary: tools.find((tool) => tool.tool === 'typst')!.path! },
    );
    expect(deadline.code).not.toBe(0);
    expect(deadline.stderrTail).toContain('time limit');
    expect(readFileSync(join(folder, 'preserved.pdf'), 'utf8')).toBe('Previous PDF bytes.');
    mkdirSync(join(folder, 'parts'));
    writeFileSync(
      join(folder, 'parts/local.typ'),
      '= A local include\n\nKept inside this document.',
    );
    writeFileSync(join(folder, 'local.typ'), '#include "parts/local.typ"');
    const local = await page.evaluate(
      (cruxId) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'typst',
          args: ['compile', 'local.typ', 'local.pdf'],
        }),
      cruxId,
    );
    expect(local.code, local.stderrTail).toBe(0);
    expect(readFileSync(join(folder, 'local.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
    if (tools.some((tool) => tool.tool === 'pandoc' && tool.path)) {
      writeFileSync(
        join(folder, 'remote.md'),
        '# Printable document\n\n```{=typst}\n#import read("package.txt").trim(): *\n```\n',
      );
      const printed = await page.evaluate(
        (cruxId) =>
          window.electronAPI!.native.pdf({
            cruxId,
            path: 'remote.md',
            out: 'exports/printed.pdf',
          }),
        cruxId,
      );
      expect(printed.engine).toBe('browser');
      expect(readFileSync(join(folder, printed.path)).subarray(0, 5).toString()).toBe('%PDF-');
      expect.soft(requests).toBe(0);
    }
  } finally {
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
