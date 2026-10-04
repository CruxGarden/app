import { get as httpGet, type ClientRequest } from 'node:http';
import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { hasPrivateApi, startPrivateApi, type PrivateApi } from './private-request-api';

test.skip(!hasPrivateApi, 'Full API checkout required; the private-app CI gate supplies it.');

test('published Private Requests signs in two visitors, isolates records, refuses forged ownership and recovers failed saves', async () => {
  test.setTimeout(240000);
  const desktop = await launchApp({ ai: false });
  let api: PrivateApi | undefined;
  let stream: ClientRequest | undefined;
  const browser = await chromium.launch();
  try {
    const { page } = desktop;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Private Requests/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('heading', { name: 'Private Requests', exact: true }),
    ).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    api = await startPrivateApi((await storedCrux(page, id)).projectFolder);
    const server = api;
    let publicEvents = '';
    await new Promise<void>((resolve, reject) => {
      stream = httpGet(server.url + '/events/' + server.crux, (response) => {
        response.on('data', (chunk) => {
          publicEvents += chunk.toString();
        });
        resolve();
      });
      stream.on('error', reject);
    });
    let loseNextSaveResponse = false;
    let holdNextSaveResponse = false;
    let releaseSave: (() => void) | undefined;
    async function route(context: BrowserContext) {
      // DNS/TLS/object-store transport only. Auth, HTTP controllers, PostgreSQL and Function isolate are real.
      await context.route(server.origin + '/**', async (r) => {
        const path = new URL(r.request().url()).pathname.replace(/^\//, '') || 'index.html';
        const response = await r.fetch({ url: server.url + '/__fixture/files/' + path });
        await r.fulfill({ response });
      });
      await context.route('https://api.private-requests.test/**', async (r) => {
        const u = new URL(r.request().url());
        const response = await r.fetch({ url: server.url + u.pathname + u.search });
        if (
          holdNextSaveResponse &&
          u.pathname.endsWith('/requests') &&
          r.request().postDataJSON()?.action === 'save'
        ) {
          holdNextSaveResponse = false;
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
        }
        if (
          loseNextSaveResponse &&
          u.pathname.endsWith('/requests') &&
          r.request().postDataJSON()?.action === 'save'
        ) {
          loseNextSaveResponse = false;
          expect(response.status()).toBe(200); // The server committed; only its acknowledgement is lost.
          await r.abort('failed');
          return;
        }
        await r.fulfill({ response });
      });
    }
    const aliceContext = await browser.newContext(),
      bobContext = await browser.newContext();
    await route(aliceContext);
    await route(bobContext);
    const alice = await aliceContext.newPage(),
      bob = await bobContext.newPage();
    const login = async (p: Page, email: string) => {
      await p.goto(server.origin);
      await p.getByLabel('Email address', { exact: true }).fill(email);
      await p.getByRole('button', { name: 'Send sign-in code', exact: true }).click();
      await expect(p.getByRole('status')).toContainText('Check your email');
      const reply = (await (
        await fetch(server.url + '/__fixture/code?email=' + encodeURIComponent(email))
      ).json()) as { code: string };
      await p.getByLabel('Sign-in code', { exact: true }).fill(reply.code);
      await p.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(p.getByLabel('Subject', { exact: true })).toBeVisible();
    };
    await login(alice, 'alice@example.test');
    await login(bob, 'bob@example.test');
    const save = async (p: Page, subject: string, details: string) => {
      await p.getByLabel('Subject', { exact: true }).fill(subject);
      await p.getByLabel('Details', { exact: true }).fill(details);
      await p.getByRole('button', { name: 'Save request', exact: true }).click();
      await expect(p.getByRole('status')).toContainText('Request saved.');
    };
    await save(alice, 'Alice commission', 'Alice private details');
    await save(bob, 'Bob commission', 'Bob private details');
    const invoke = (p: Page, body: unknown) =>
      p.evaluate(async (b) => {
        try {
          return { ok: true, body: await (window as any).crux.fn('requests', b) };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }, body);
    const aliceList = await invoke(alice, { action: 'list' });
    const aliceId = aliceList.body.requests[0].visitorId;
    expect(aliceList.body.requests).toEqual([
      { visitorId: aliceId, subject: 'Alice commission', details: 'Alice private details' },
    ]);
    const bobList = await invoke(bob, { action: 'list', visitorId: aliceId, isOwner: true });
    expect(bobList.body.requests).toHaveLength(1);
    expect(bobList.body.requests[0].subject).toBe('Bob commission');
    expect(await invoke(bob, { action: 'remove', visitorId: aliceId })).toMatchObject({
      ok: false,
    });
    expect(
      await bob.evaluate(async (key) => (window as any).crux.store.get(key), 'requests/' + aliceId),
    ).toBeNull();
    // Forged JSON in Bob's protected slot under Alice's key must not become Alice's request or an owner-inbox entry.
    await bob.evaluate(
      async (key) =>
        (window as any).crux.store.set(
          key,
          { visitorId: key.slice(9), subject: 'Forged', details: 'not Alice', isOwner: true },
          { mode: 'protected' },
        ),
      'requests/' + aliceId,
    );
    // A conflicting public-mode attempt must not leak the previous protected value either.
    const refusedMode = await bob.evaluate(async (key) => {
      try {
        await (window as any).crux.store.set(key, 'promotion attempt', { mode: 'public' });
        return false;
      } catch {
        return true;
      }
    }, 'requests/' + aliceId);
    expect(refusedMode).toBe(true);
    await bob.evaluate(async () =>
      (window as any).crux.store.set('public-note', 'Safe public note', { mode: 'public' }),
    );
    await expect.poll(() => publicEvents).toContain('Safe public note');
    expect(publicEvents).not.toContain('not Alice');
    expect(publicEvents).not.toContain('Alice private details');
    expect(publicEvents).not.toContain('Bob private details');
    const ownerCall = async (body: unknown) => {
      const r = await fetch(server.url + '/fn/' + server.crux + '/requests', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + server.ownerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      expect(r.status).toBe(200);
      return r.json();
    };
    const inbox = await ownerCall({ action: 'list' });
    expect(inbox.requests).toHaveLength(2);
    expect(inbox.requests.map((r: { subject: string }) => r.subject).sort()).toEqual([
      'Alice commission',
      'Bob commission',
    ]);
    // Refuse input in the actual handler; preserve it in the actual page.
    await alice.getByLabel('Subject', { exact: true }).fill('   ');
    await alice.locator('#request-form').evaluate((f: HTMLFormElement) => {
      f.noValidate = true;
    });
    await alice.getByRole('button', { name: 'Save request', exact: true }).click();
    await expect(alice.getByRole('status')).toContainText('Add a subject');
    await expect(alice.getByLabel('Details', { exact: true })).toHaveValue('Alice private details');
    await alice.getByRole('button', { name: 'Show error details', exact: true }).click();
    await expect(alice.locator('#error-details')).toContainText('Save request');
    await expect(alice.locator('#error-details')).not.toContainText('Alice private details');
    await save(alice, 'Alice corrected', 'Alice private details');
    expect((await ownerCall({ action: 'list' })).requests).toHaveLength(2);
    loseNextSaveResponse = true;
    await alice.getByLabel('Subject', { exact: true }).fill('Uncertain save');
    await alice.getByRole('button', { name: 'Save request', exact: true }).click();
    await expect(alice.getByRole('status')).toContainText('Your unsaved text is still here');
    await expect(alice.getByLabel('Subject', { exact: true })).toHaveValue('Uncertain save');
    expect(
      (await ownerCall({ action: 'list' })).requests.find((r: any) => r.visitorId === aliceId)
        .subject,
    ).toBe('Uncertain save');
    await save(alice, 'Uncertain save', 'Alice private details');
    expect((await ownerCall({ action: 'list' })).requests).toHaveLength(2);
    await alice.screenshot({
      path: test.info().outputPath('private-customer.png'),
      fullPage: true,
    });
    // Signing into the visitor page with the creator's email still grants only scoped visitor rights.
    const creatorContext = await browser.newContext();
    await route(creatorContext);
    const creator = await creatorContext.newPage();
    await login(creator, 'owner@example.test');
    expect((await invoke(creator, { action: 'profile' })).body.visitor.isOwner).toBe(false);
    expect((await invoke(creator, { action: 'list' })).body.requests).toHaveLength(0);
    expect(await invoke(creator, { action: 'remove', visitorId: aliceId })).toMatchObject({
      ok: false,
    });
    await ownerCall({ action: 'remove', visitorId: aliceId });
    await alice.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await expect(alice.getByLabel('Subject', { exact: true })).toHaveValue('');
    await expect(bob.getByLabel('Details', { exact: true })).toHaveValue('Bob private details');
    await alice.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(alice.getByLabel('Email address', { exact: true })).toBeVisible();
    holdNextSaveResponse = true;
    await bob.getByLabel('Subject', { exact: true }).fill('Delayed private edit');
    await bob.getByRole('button', { name: 'Save request', exact: true }).click();
    await expect.poll(() => !!releaseSave).toBe(true);
    // A parent/session revocation can arrive while page controls are busy.
    await bob.evaluate(async () => (window as any).crux.auth.logout());
    await expect(bob.getByLabel('Subject', { exact: true })).toBeHidden();
    await expect(bob.locator('#inbox')).toBeEmpty();
    releaseSave!();
    await expect(bob.getByLabel('Email address', { exact: true })).toBeVisible();
    await expect(bob.getByLabel('Subject', { exact: true })).toBeHidden();
    await expect(bob.locator('body')).not.toContainText('Bob private details');
    expect(await invoke(bob, { action: 'list' })).toMatchObject({ ok: false });
  } finally {
    stream?.destroy();
    const cleanup = await Promise.allSettled([browser.close(), api?.stop(), desktop.app.close()]);
    const failed = cleanup.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
});
