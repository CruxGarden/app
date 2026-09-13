import type { ElectronApplication, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';

/** Open a URL in a fresh desktop window and return its page, leaving the Workshop's preview untouched. */
export async function openWindow(app: ElectronApplication, url: string): Promise<Page> {
  const opened = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }, url) => {
    const w = new BrowserWindow({ width: 1200, height: 900, show: false });
    void w.loadURL(url);
  }, url);
  const page = await opened;
  page.setDefaultTimeout(30000);
  return page;
}
/** Serve a built site folder on a loopback port. */
export async function serve(dist: string) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(req.url!.split('?')[0]!);
    if (path.includes('..')) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    try {
      res.setHeader(
        'Content-Type',
        path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html',
      );
      res.end(readFileSync(join(dist, path)));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
