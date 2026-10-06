import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { enableAdvancedMode, openPanel } from '../panel-helpers';
import { indexedFiles } from '../content-helpers';
import { createHash } from 'node:crypto';

/**
 * V1-TESTING-GUIDE § 18 · Functions, rules and secrets — the rows the local
 * runner can answer without an API (functions-local.spec.ts is FUNC-01 and
 * FUNC-06). Next/last run of a schedule, FUNC-05's HTTP shapes and the shared
 * address are e2e/functions.spec.ts (opt-in: CRUX_LOCAL_API); FUNC-09's live
 * Order Desk and FUNC-10's real model are manual.
 */
/** The Share pane's Functions section — shown once the crux has a page to share. */
async function functionsPane(page: Page) {
  const artifacts = await openPanel(page, 'artifacts', 'Toggle artifacts');
  await expect(artifacts.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const share = await openPanel(page, 'publish', 'Toggle share');
  await share.getByText('Optional enhancements', { exact: true }).click();
  const fns = share.getByTestId('functions-section');
  await expect(fns).toBeVisible({ timeout: 30_000 });
  return fns;
}

/** Delete a file from the Artifacts tree through its context menu. */
async function deleteFromTree(page: Page, name: string) {
  const artifacts = await openPanel(page, 'artifacts', 'Toggle artifacts');
  const tree = artifacts.getByRole('tree');
  const folder = tree.getByText('functions', { exact: true });
  if (
    !(await tree
      .getByText(name, { exact: true })
      .isVisible()
      .catch(() => false))
  )
    await folder.click();
  await tree.getByText(name, { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(tree.getByText(name, { exact: true })).toHaveCount(0);
}

test.describe('guide 18 · Functions', () => {
  test('FUNC-02 — emit and log rules act once; an edited rule runs edited; a deleted rule stops', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      const id = await createCrux(page, 'Rules');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      writeFileSync(join(folder, 'index.html'), '<!doctype html><h1>Rules</h1>');
      const fns = await functionsPane(page);

      // When ping → emit pong.
      await fns.getByRole('button', { name: 'When → Then…' }).click();
      const rule = fns.getByTestId('when-then');
      await rule.getByRole('textbox', { name: 'Event', exact: true }).fill('ping');
      await rule.getByRole('combobox', { name: 'Then' }).selectOption('emit');
      await rule.getByRole('textbox', { name: 'Event to emit' }).fill('pong');
      await rule.getByRole('button', { name: 'Add handler' }).click();
      await expect(fns.getByTestId('function-on-ping')).toContainText('on "ping"');
      expect(readFileSync(join(folder, 'functions/on-ping.js'), 'utf8')).toContain(
        'ctx.emit("pong"',
      );
      // When pong → log it.
      await fns.getByRole('button', { name: 'When → Then…' }).click();
      await rule.getByRole('textbox', { name: 'Event', exact: true }).fill('pong');
      await rule.getByRole('combobox', { name: 'Then' }).selectOption('log');
      await rule.getByRole('button', { name: 'Add handler' }).click();
      await expect(fns.getByTestId('function-on-pong')).toContainText('on "pong"');

      // Emit ping: one handler answers, and it emitted pong once.
      await fns.getByTestId('function-on-ping').getByRole('button', { name: 'Emit' }).click();
      await expect(fns).toContainText('ping reached 1 handler here.');
      await expect(fns.getByTestId('function-result-on-ping')).toContainText('"emitted": "pong"');
      // Emit pong: the log rule heard it, once, and says so.
      await fns.getByTestId('function-on-pong').getByRole('button', { name: 'Emit' }).click();
      await expect(fns).toContainText('pong reached 1 handler here.');
      const pongResult = fns.getByTestId('function-result-on-pong');
      await expect(pongResult).toContainText('"heard": "pong"');
      expect(((await pongResult.textContent()) ?? '').match(/heard pong/g)?.length ?? 0).toBe(1);

      // Edit the rule in its file (as any editor would): once the app has
      // taken the edit in, the edit is what runs.
      const edited = readFileSync(join(folder, 'functions/on-ping.js'), 'utf8').replace(
        'return { emitted: "pong" };',
        'return { emitted: "pong", edited: true };',
      );
      expect(edited).toContain('edited: true');
      writeFileSync(join(folder, 'functions/on-ping.js'), edited);
      await expect
        .poll(async () => (await indexedFiles(page, id))['functions/on-ping.js'], {
          timeout: 60_000,
        })
        .toBe(createHash('sha256').update(edited).digest('hex'));
      await fns.getByTestId('function-on-ping').getByRole('button', { name: 'Emit' }).click();
      await expect(fns.getByTestId('function-result-on-ping')).toContainText('"edited": true');

      // Delete the log rule: it leaves the list and stops running.
      await deleteFromTree(page, 'on-pong.js');
      await expect(fns.getByTestId('function-on-pong')).toHaveCount(0);
      await expect.poll(() => existsSync(join(folder, 'functions/on-pong.js'))).toBe(false);
      await fns.getByTestId('function-on-ping').getByRole('button', { name: 'Emit' }).click();
      await expect(fns).toContainText('ping reached 1 handler here.');
      await expect(fns.getByTestId('function-on-pong')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('FUNC-03 — a scheduled rule: bad schedule text is refused with words, a valid one is listed and runs by hand, and removal clears it', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      const id = await createCrux(page, 'Clockwork');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      writeFileSync(join(folder, 'index.html'), '<!doctype html><h1>Clockwork</h1>');
      const fns = await functionsPane(page);
      await fns.getByRole('button', { name: 'When → Then…' }).click();
      const rule = fns.getByTestId('when-then');
      await rule.getByRole('combobox', { name: 'Kind' }).selectOption('schedule');
      await rule.getByRole('textbox', { name: 'Handler name' }).fill('tick');
      await rule.getByRole('combobox', { name: 'Then' }).selectOption('store');
      await rule.getByRole('textbox', { name: 'Key' }).fill('last-tick');

      // Invalid schedule text fails clearly and writes nothing.
      await rule.getByRole('textbox', { name: 'Schedule' }).fill('every banana');
      await rule.getByRole('button', { name: 'Add handler' }).click();
      await expect(fns.locator('p.text-error')).toContainText(/five fields|every/i);
      await expect(fns.getByTestId('function-tick')).toHaveCount(0);
      expect(existsSync(join(folder, 'functions/tick.js'))).toBe(false);
      await rule.getByRole('textbox', { name: 'Schedule' }).fill('every 90m');
      await rule.getByRole('button', { name: 'Add handler' }).click();
      await expect(fns.locator('p.text-error')).toContainText(/minutes go up to 59/);
      await expect(fns.getByTestId('function-tick')).toHaveCount(0);

      // A valid one is written with its schedule, and Run tries it here.
      // (Next/last run come from the API once shared: e2e/functions.spec.ts.
      // The local row does not yet read `export const schedule` back, so it
      // is listed as an HTTP handler until then.)
      await rule.getByRole('textbox', { name: 'Schedule' }).fill('every 1m');
      await rule.getByRole('button', { name: 'Add handler' }).click();
      await expect(fns.getByTestId('function-tick')).toBeVisible();
      await expect(fns).toContainText("runs on the API's clock once shared");
      await expect
        .poll(() => readFileSync(join(folder, 'functions/tick.js'), 'utf8'))
        .toContain('export const schedule = "every 1m"');
      await fns.getByTestId('function-tick').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-tick')).toContainText('"wrote": "last-tick"');

      // Removed: it stops being listed.
      await deleteFromTree(page, 'tick.js');
      await expect(fns.getByTestId('function-tick')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('FUNC-04 — Run answers a good handler and reports a handler error as a failure, never as success', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      const id = await createCrux(page, 'Answers');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      writeFileSync(join(folder, 'index.html'), '<!doctype html><h1>Answers</h1>');
      const fns = await functionsPane(page);
      await fns.getByRole('button', { name: 'Add a starter function' }).click();
      await expect(fns.getByTestId('function-hello')).toBeVisible();
      await fns.getByTestId('function-hello').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-hello')).toContainText('200');
      await expect(fns.getByTestId('function-result-hello')).toContainText('"ok": true');
      await expect(fns).toContainText(/hello answered 200 in \d+ ms here\./);

      // A handler that throws: the error is shown with its status, and the
      // note does not call it a success.
      writeFileSync(
        join(folder, 'functions/boom.js'),
        "export default async function () { throw new Error('boom went wrong'); }\n",
      );
      await expect(fns.getByTestId('function-boom')).toBeVisible({ timeout: 30_000 });
      await fns.getByTestId('function-boom').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-boom')).toContainText('500');
      await expect(fns.getByTestId('function-result-boom')).toContainText('boom went wrong');
      await expect(fns).toContainText(/boom answered 500/);

      // A refusal keeps its own status.
      writeFileSync(
        join(folder, 'functions/picky.js'),
        "export default async function (req, ctx) { ctx.reject('Not like that', 422); }\n",
      );
      await expect(fns.getByTestId('function-picky')).toBeVisible({ timeout: 30_000 });
      await fns.getByTestId('function-picky').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-picky')).toContainText('422');
      await expect(fns.getByTestId('function-result-picky')).toContainText('Not like that');
    } finally {
      await app.close();
    }
  });

  test('FUNC-07 — a secret is listed by name, read by a handler, never written as source, and stops resolving once removed', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      const id = await createCrux(page, 'Keys');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      writeFileSync(
        join(folder, 'index.html'),
        '<!doctype html><script src="crux.js"></script><h1>Keys</h1>',
      );
      mkdirSync(join(folder, 'functions'), { recursive: true });
      writeFileSync(
        join(folder, 'functions/whoami.js'),
        "export default async function (req, ctx) { const t = ctx.secrets.get('TOKEN'); return { has: ctx.secrets.has('TOKEN'), len: t ? t.length : 0 }; }\n",
      );
      const fns = await functionsPane(page);
      await expect(fns.getByTestId('function-whoami')).toBeVisible({ timeout: 30_000 });
      const secrets = fns.getByTestId('function-secrets');
      await secrets.getByRole('textbox', { name: 'Secret name' }).fill('TOKEN');
      await secrets.getByLabel('Secret value').fill('hunter2-secret');
      await secrets.getByRole('button', { name: 'Set', exact: true }).click();
      await expect(fns).toContainText('Secret TOKEN set');
      await expect(secrets).toContainText('TOKEN');
      await expect(secrets).toContainText('here');
      // The value is not displayed, and it is not in the project folder.
      await expect(fns).not.toContainText('hunter2-secret');
      await expect(secrets.getByLabel('Secret value')).toHaveValue('');
      const inFolder = (dir: string): boolean =>
        readdirSync(dir).some((name) => {
          const p = join(dir, name);
          if (name === 'node_modules') return false;
          if (statSync(p).isDirectory()) return inFolder(p);
          return readFileSync(p).includes('hunter2-secret');
        });
      expect(inFolder(folder)).toBe(false);

      // The handler reads it.
      await fns.getByTestId('function-whoami').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-whoami')).toContainText('"has": true');
      await expect(fns.getByTestId('function-result-whoami')).toContainText('"len": 14');

      // Removed: the handler no longer finds it.
      await secrets.getByRole('button', { name: 'Remove' }).click();
      await expect(fns).toContainText('Secret TOKEN removed.');
      await expect(secrets).not.toContainText('TOKEN');
      await fns.getByTestId('function-whoami').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-whoami')).toContainText('"has": false');
      await expect(fns.getByTestId('function-result-whoami')).toContainText('"len": 0');
      expect(inFolder(folder)).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('FUNC-08 — ctx.fetch reaches a host listed in functions/egress.json and is refused for one that is not', async () => {
    test.setTimeout(180_000);
    // The "external" endpoint: a server on this machine, answered by name.
    // (The workspace runner fetches from the renderer, so the host must allow
    // cross-origin reads, as a real API host would.)
    const endpoint = createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.setHeader('access-control-allow-origin', '*');
      res.end(`pong from ${req.headers.host} ${req.url}`);
    });
    await new Promise<void>((resolve) => endpoint.listen(0, '127.0.0.1', resolve));
    const port = (endpoint.address() as { port: number }).port;
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      const id = await createCrux(page, 'Outbound');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      writeFileSync(join(folder, 'index.html'), '<!doctype html><h1>Outbound</h1>');
      mkdirSync(join(folder, 'functions'), { recursive: true });
      writeFileSync(
        join(folder, 'functions/egress.json'),
        JSON.stringify({ hosts: ['127.0.0.1'] }, null, 2),
      );
      const handler = (host: string) =>
        `export default async function (req, ctx) { const r = await ctx.fetch('http://${host}:${port}/ok'); return { status: r.status, text: await r.text() }; }\n`;
      writeFileSync(join(folder, 'functions/allowed.js'), handler('127.0.0.1'));
      writeFileSync(join(folder, 'functions/denied.js'), handler('localhost'));
      const fns = await functionsPane(page);
      await expect(fns.getByTestId('function-allowed')).toBeVisible({ timeout: 30_000 });
      await expect(fns.getByTestId('function-denied')).toBeVisible();

      await fns.getByTestId('function-allowed').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-allowed')).toContainText('"status": 200');
      await expect(fns.getByTestId('function-result-allowed')).toContainText('pong from');

      await fns.getByTestId('function-denied').getByRole('button', { name: 'Run' }).click();
      await expect(fns.getByTestId('function-result-denied')).toContainText('500');
      await expect(fns.getByTestId('function-result-denied')).toContainText(
        'localhost is not in functions/egress.json',
      );
      await expect(fns).toContainText(/denied answered 500/);
    } finally {
      await app.close();
      await new Promise<void>((r) => endpoint.close(() => r()));
    }
  });
});
