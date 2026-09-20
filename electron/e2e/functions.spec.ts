import { test, expect, request } from '@playwright/test';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { LOCAL_API, LOCAL_API_LOG, useLocalApi, signInLocally } from './local-api-helpers';

/**
 * Crux Functions, end to end (CRUX-FUNCTIONS-PLAN F0 + F6): from the Share
 * pane a starter HTTP handler and a When → Then rule are written into
 * `functions/`; the crux is shared to an API on this machine; the API runs
 * the handler, an emitted event reaches the rule's handler, which writes
 * the Store, and the Share pane's Run and Emit answer the same way.
 * Opt-in — see local-api-helpers.ts for the environment.
 */
test.skip(!LOCAL_API || !LOCAL_API_LOG, 'set CRUX_LOCAL_API and CRUX_LOCAL_API_LOG');

test('a crux gets a backend: functions run and events reach their handlers', async () => {
  test.setTimeout(420000);
  const { app, page, dir } = await launchApp();
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await useLocalApi(page);
    await signInLocally(page);
    await page.keyboard.press('Escape');
    const id = await createCrux(page, 'Orders');
    // A page to share; the backend stands behind it.
    await addArtifact(page, 'index.html');
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.type('<h1>Orders</h1>');
    await page.keyboard.press('ControlOrMeta+s');

    // Share pane → Functions: a starter, then a rule "when ping, write last-ping".
    await page.getByRole('button', { name: 'Toggle share' }).click();
    const fns = page.getByTestId('functions-section');
    await expect(fns).toBeVisible();
    await fns.getByRole('button', { name: 'Add a starter function' }).click();
    await expect(fns.getByTestId('function-hello')).toBeVisible();
    await fns.getByRole('button', { name: 'When → Then…' }).click();
    const rule = fns.getByTestId('when-then');
    await rule.getByRole('textbox', { name: 'Event' }).fill('ping');
    await rule.getByRole('combobox', { name: 'Then' }).selectOption('store');
    await rule.getByRole('textbox', { name: 'Key' }).fill('last-ping');
    await rule.getByRole('button', { name: 'Add handler' }).click();
    await expect(fns.getByTestId('function-on-ping')).toBeVisible();
    await expect(fns.getByTestId('function-on-ping')).toContainText('on "ping"');
    // …and a scheduled one: "every 1m, write last-tick" — the API's clock runs it (F3).
    await fns.getByRole('button', { name: 'When → Then…' }).click();
    await rule.getByRole('combobox', { name: 'Kind' }).selectOption('schedule');
    await rule.getByRole('textbox', { name: 'Schedule' }).fill('every 1m');
    await rule.getByRole('textbox', { name: 'Handler name' }).fill('tick');
    await rule.getByRole('combobox', { name: 'Then' }).selectOption('store');
    await rule.getByRole('textbox', { name: 'Key' }).fill('last-tick');
    await rule.getByRole('button', { name: 'Add handler' }).click();
    await expect(fns.getByTestId('function-tick')).toBeVisible();

    // A secret and an outbound call (F1): the handler reads ctx.secrets and
    // reaches the one host functions/egress.json allows — the API itself here.
    const garden = join(dir, 'garden');
    const folder = join(garden, readdirSync(garden)[0]!);
    mkdirSync(join(folder, 'functions'), { recursive: true });
    writeFileSync(
      join(folder, 'functions', 'egress.json'),
      JSON.stringify({ hosts: ['127.0.0.1', 'localhost'] }),
    );
    writeFileSync(
      join(folder, 'functions', 'remote.js'),
      [
        'export default async function (req, ctx) {',
        '  const token = ctx.secrets.get("TOKEN");',
        `  const r = await ctx.fetch("${LOCAL_API}/fn/" + ctx.crux.id + "/hello", { method: "POST", body: { via: "remote" } });`,
        '  return { hasToken: !!token, len: (token || "").length, remoteStatus: r.status, echoed: (await r.json()).echo };',
        '}',
        '',
      ].join('\n'),
    );
    await expect(fns.getByTestId('function-remote')).toBeVisible({ timeout: 30_000 });
    const secrets = fns.getByTestId('function-secrets');
    await secrets.getByRole('textbox', { name: 'Secret name' }).fill('TOKEN');
    await secrets.getByRole('textbox', { name: 'Secret value' }).fill('s3cret');
    await secrets.getByRole('button', { name: 'Set' }).click();
    await expect(secrets).toContainText('TOKEN');

    // Share it (the first share asks about a backup).
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const backupAsk = page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' });
    if (await backupAsk.isVisible({ timeout: 3000 }).catch(() => false))
      await backupAsk.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(page.getByText('Up to date')).toBeVisible({ timeout: 120000 });

    // The API, as any page would call it.
    const api = await request.newContext({ baseURL: LOCAL_API });
    const listed = await (await api.get(`/fn/${id}`)).json();
    expect(listed.map((f: { name: string }) => f.name).sort()).toEqual([
      'hello',
      'on-ping',
      'remote',
      'tick',
    ]);
    // The secret reaches the address right after the share (the app pushes what
    // was set here); the handler reads it and calls out through ctx.fetch.
    await expect
      .poll(async () => (await api.post(`/fn/${id}/remote`, { data: {} })).json(), {
        timeout: 20_000,
        intervals: [1_000],
      })
      .toEqual({ hasToken: true, len: 6, remoteStatus: 200, echoed: { via: 'remote' } });
    expect(listed.find((f: { name: string }) => f.name === 'tick')).toMatchObject({
      schedule: '*/1 * * * *',
      nextRun: expect.any(String),
    });
    const hello = await api.post(`/fn/${id}/hello`, { data: { n: 1 } });
    expect(hello.status()).toBe(200);
    expect(await hello.json()).toMatchObject({ ok: true, echo: { n: 1 } });
    // The crux's own API: any method, from any origin, with the query and the rest of the path.
    const got = await api.get(`/fn/${id}/hello/42?who=ada`, {
      headers: { Origin: 'https://elsewhere.example' },
    });
    expect(got.status()).toBe(200);
    expect(got.headers()['access-control-allow-origin']).toBe('https://elsewhere.example');
    expect(await got.json()).toMatchObject({ ok: true, echo: null });
    const ping = await api.post(`/events/${id}/ping`, { data: { order: 42 } });
    expect(ping.status()).toBe(202);
    expect(await ping.json()).toMatchObject({ event: 'ping', handlers: 1 });
    const last = await api.get(`/store/${id}/last-ping`);
    expect(last.status()).toBe(200);
    expect(await last.json()).toMatchObject({ value: { order: 42 } });
    // The clock: within two minutes the scheduled handler has written last-tick.
    // (a missing key answers 200 with a null value, so poll the value)
    await expect
      .poll(async () => (await (await api.get(`/store/${id}/last-tick`)).json()).value, {
        timeout: 150_000,
        intervals: [5_000],
      })
      .toMatchObject({ schedule: '*/1 * * * *', name: 'tick' });
    const ticked = (await (await api.get(`/fn/${id}`)).json()).find(
      (f: { name: string }) => f.name === 'tick',
    );
    expect(ticked).toMatchObject({ lastStatus: '200', lastRun: expect.any(String) });
    await api.dispose();

    // And from the Share pane, signed in: Run and Emit show their answers.
    await fns.getByTestId('function-hello').getByRole('button', { name: 'Run' }).click();
    await expect(fns.getByTestId('function-result-hello')).toContainText('"ok": true');
    await fns.getByTestId('function-on-ping').getByRole('button', { name: 'Emit' }).click();
    await expect(fns.getByTestId('function-result-on-ping')).toContainText('"wrote": "last-ping"');
    await page.screenshot({ path: 'e2e/.results/functions.png' });
  } finally {
    await app.close();
  }
});
