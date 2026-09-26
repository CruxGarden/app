import { togglePanel } from './panel-helpers';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { indexedFiles } from './content-helpers';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Crux Functions in the workspace (CRUX-FUNCTIONS-PLAN, the preview runner
 * and F2 Store hooks): nothing shared, no API. The Share pane writes the
 * starter and crux.js; a page in the folder calls crux.fn, hears crux.on and
 * writes the Store; a functions/on-store.js hook refuses a score that goes
 * down — the same answer the API gives once the crux is shared.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Scores</title>
<script src="crux.js"></script></head><body>
<h1>Scores</h1>
<pre id="out">…</pre><pre id="saved">—</pre><pre id="events"></pre>
<button id="save3">Save 3</button><button id="save1">Save 1</button>
<script>
  crux.fn('hello', { n: 1 }).then(function (r) { out.textContent = JSON.stringify(r); }, function (e) { out.textContent = 'ERR ' + e.message; });
  crux.on('ping', function (data) { events.textContent += 'ping ' + JSON.stringify(data) + '\\n'; });
  function save(n) { crux.store.set('score', n, { mode: 'public' }).then(function () { saved.textContent = 'saved ' + n; }, function (e) { saved.textContent = 'refused: ' + e.message; }); }
  save3.onclick = function () { save(3); };
  save1.onclick = function () { save(1); };
</script></body></html>`;

const HOOK = `// functions/on-store.js — scores only go up.
export const match = 'store:*';
export default async function (req, ctx) {
  if (req.method !== 'EVENT' || JSON.stringify(await req.json()) !== JSON.stringify(ctx.event.data)) ctx.reject('wrong event request', 422);
  const { key, value, before } = ctx.event.data;
  if (key === 'score' && before != null && value < before) ctx.reject('scores only go up', 422);
  return { checked: key };
}
`;

test('a page calls its functions, hears events and is refused by a Store hook, all in the workspace', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Scores');
    const folder = cruxFolder(dir);

    // The page and the hook, written into the folder as any editor or agent would.
    mkdirSync(join(folder, 'functions'), { recursive: true });
    writeFileSync(join(folder, 'functions', 'on-store.js'), HOOK);
    writeFileSync(join(folder, 'index.html'), PAGE);
    await togglePanel(page, 'Toggle artifacts');
    await expect(page.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Share pane → Functions: the starter, which brings crux.js with it.
    await togglePanel(page, 'Toggle share');
    const fns = page.getByTestId('functions-section');
    await expect(fns.getByTestId('function-on-store')).toBeVisible({ timeout: 30_000 });
    await fns.getByRole('button', { name: 'Add a starter function' }).click();
    await expect(fns.getByTestId('function-hello')).toBeVisible();
    await expect.poll(() => existsSync(join(folder, 'crux.js'))).toBe(true);
    await expect(fns).toContainText('They run here');

    // The same exported helpers and local bindings work here and on the API.
    const hello = `export const value = 3;
export function double(n) { return n * 2; }
export default async function hello(req, ctx) {
  ctx.log('hello from', ctx.visitor?.id);
  return ctx.json({ ok: true, echo: await req.json(), helper: double(value), literal: 'export default function', method: req.method, owner: ctx.owner.id });
}`;
    writeFileSync(join(folder, 'functions', 'hello.js'), hello);
    await expect
      .poll(async () => (await indexedFiles(page, cruxId))['functions/hello.js'])
      .toBe(createHash('sha256').update(hello).digest('hex'));

    // Run from the Share pane: the local runner answers.
    await fns.getByTestId('function-hello').getByRole('button', { name: 'Run' }).click();
    await expect(fns.getByTestId('function-result-hello')).toContainText('"ok": true');
    await expect(fns.getByTestId('function-result-hello')).toContainText('hello from');
    await expect(fns.getByTestId('function-result-hello')).toContainText('"helper": 6');
    await expect(fns.getByTestId('function-result-hello')).toContainText('"method": "POST"');
    await expect(fns.getByTestId('function-result-hello')).toContainText('export default function');

    // The preview: crux.fn from the page.
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByRole('heading')).toHaveText('Scores', { timeout: 30_000 });
    await expect(frame.locator('#out')).toContainText('"ok":true', { timeout: 15_000 });
    await expect(frame.locator('#out')).toContainText('"echo":{"n":1}');

    // The Store hook: 3 is saved, 1 is refused, 3 stays.
    await frame.locator('#save3').click();
    await expect(frame.locator('#saved')).toHaveText('saved 3');
    await frame.locator('#save1').click();
    await expect(frame.locator('#saved')).toHaveText('refused: scores only go up');

    // Emit from the Share pane; the page hears it through crux.on.
    writeFileSync(
      join(folder, 'functions', 'on-ping.js'),
      `export default async function (req, ctx) { await ctx.store.set('last-ping', ctx.event.data, 'public'); return { wrote: 'last-ping' }; }\n`,
    );
    await expect(fns.getByTestId('function-on-ping')).toBeVisible({ timeout: 30_000 });
    await fns.getByTestId('function-on-ping').getByRole('button', { name: 'Emit' }).click();
    await expect(fns.getByTestId('function-result-on-ping')).toContainText('"wrote": "last-ping"');
    await expect(frame.locator('#events')).toContainText('ping {}');
    await page.screenshot({ path: 'e2e/.results/functions-local.png' });
  } finally {
    await app.close();
  }
});
