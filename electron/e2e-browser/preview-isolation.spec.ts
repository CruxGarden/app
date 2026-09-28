import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

let host: Server;
let publisher: Server;
let origin: string;
let publishedOrigin: string;
const probe = `<script>
  window.boundary = {};
  try { boundary.storage = localStorage.getItem('isolation-canary'); }
  catch { boundary.storage = 'blocked'; }
  try { boundary.cookies = document.cookie; }
  catch { boundary.cookies = 'blocked'; }
  try { parent.document.documentElement.dataset.previewEscaped = 'yes'; boundary.parent = 'accessible'; }
  catch { boundary.parent = 'blocked'; }
  Promise.resolve().then(() => caches.keys()).then(keys => boundary.caches = keys).catch(() => boundary.caches = 'blocked');
</script>`;
const files: Record<string, [string, string]> = {
  '/index.html': [
    'text/html',
    `<h1>Isolated creation</h1><link rel="stylesheet" href="./style.css"><output id="module"></output><a href="./second.html">Next page</a><script type="module" src="./module.js"></script>${probe}`,
  ],
  '/style.css': ['text/css', 'h1 { color: rgb(12, 34, 56); }'],
  '/module.js': [
    'application/javascript',
    "const data = await (await fetch('./message.json')).json(); document.querySelector('#module').textContent = data.message;",
  ],
  '/message.json': ['application/json', '{"message":"Module and fetch work"}'],
  '/second.html': ['text/html', '<h1>Second page</h1>'],
};

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}
test.beforeAll(async () => {
  const worker = await readFile(join(__dirname, '../../public/preview-sw.js'));
  host = createServer((req, res) => {
    if (req.url === '/preview-sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(worker);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Preview host</title><body><h1>App host</h1></body>');
    }
  });
  origin = `http://127.0.0.1:${await listen(host)}`;
  publisher = createServer((req, res) => {
    const file = files[req.url ?? ''];
    res.writeHead(file ? 200 : 404, { 'Content-Type': file?.[0] ?? 'text/plain' });
    res.end(file?.[1] ?? 'Not found');
  });
  // A separate hostname also keeps host-only cookies apart (cookies ignore ports).
  publishedOrigin = `http://localhost:${await listen(publisher)}`;
});
test.afterAll(async () => {
  for (const server of [host, publisher]) {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});

async function prepareHost(page: Page) {
  await page.goto(origin);
  await page.evaluate(async (html) => {
    localStorage.setItem('isolation-canary', 'private-app-value');
    document.cookie = 'isolation_canary=private-cookie; SameSite=Strict; path=/';
    const cache = await caches.open('crux-preview-isolation');
    // Existing cache content must not regain the app's origin after the update.
    await cache.put(
      '/__preview/isolation/index.html',
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
    );
    await navigator.serviceWorker.register('/preview-sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  }, files['/index.html'][1]);
}
async function frame(page: Page, url: string) {
  await page.evaluate((src) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Published creation';
    iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms');
    iframe.src = src;
    document.body.append(iframe);
  }, url);
  return page.frameLocator('iframe[title="Published creation"]');
}

test('old cached HTML is refused even inside a permissive iframe', async ({ page }) => {
  await prepareHost(page);
  const preview = await frame(page, '/__preview/isolation/index.html');
  await expect(preview.locator('body')).toHaveText(
    'This preview has moved. Open the creation on its publishing site.',
  );
  expect(
    await page.evaluate(() => document.documentElement.dataset.previewEscaped),
  ).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('isolation-canary'))).toBe(
    'private-app-value',
  );
});

test('direct navigation to cached HTML is refused and normal app requests still work', async ({
  page,
  context,
}) => {
  await prepareHost(page);
  const direct = await context.newPage();
  const response = await direct.goto(`${origin}/__preview/isolation/index.html`);
  expect(response?.status()).toBe(410);
  expect(response?.headers()['content-type']).toContain('text/plain');
  await expect(direct.locator('body')).toHaveText(
    'This preview has moved. Open the creation on its publishing site.',
  );
  expect(await page.evaluate(async () => (await fetch('/ordinary-app-route')).status)).toBe(200);
  expect(await page.evaluate(() => localStorage.getItem('isolation-canary'))).toBe(
    'private-app-value',
  );
});

test('a separate publishing origin loads assets and pages without app DOM, storage or cookies', async ({
  page,
}) => {
  await prepareHost(page);
  const preview = await frame(page, `${publishedOrigin}/index.html`);
  await expect(preview.locator('#module')).toHaveText('Module and fetch work');
  await expect(preview.locator('h1')).toHaveCSS('color', 'rgb(12, 34, 56)');
  await expect
    .poll(() =>
      preview.locator('body').evaluate(() => (window as unknown as { boundary: unknown }).boundary),
    )
    .toEqual({ storage: null, cookies: '', parent: 'blocked', caches: [] });
  expect(
    await page.evaluate(() => document.documentElement.dataset.previewEscaped),
  ).toBeUndefined();
  await preview.getByRole('link', { name: 'Next page' }).click();
  await expect(preview.getByRole('heading', { name: 'Second page' })).toBeVisible();
});
