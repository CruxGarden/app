import { test, expect, type Page, type Locator } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi, type MockApi } from '../api-mock';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel, showPane, panelPressed, togglePanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/** Share a fresh Crux without a backup; returns the Share pane and the API's id for it. */
async function shareFirst(page: Page, api: MockApi) {
  const share = await openPanel(page, 'publish', 'Toggle share');
  await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
  await connectAccount(page);
  const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await ask.getByRole('button', { name: 'Share without a backup' }).click();
  await expect(share.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
  return { share, cruxId: Object.keys(api.state.published)[0]! };
}

/** Update: the pane asks the backup question again each time; share without one. */
async function update(page: Page, share: Locator) {
  await share.getByRole('button', { name: 'Update', exact: true }).click();
  const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await ask.getByRole('button', { name: 'Share without a backup' }).click();
}

/** What a visitor's browser gets for the served page. */
const servedPage = async (api: MockApi, cruxId: string) =>
  (await fetch(`${api.url}/published/${cruxId}/index.html`)).text();

const retype = async (page: Page, monaco: Locator, text: string) => {
  await monaco.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('ControlOrMeta+s');
};

/**
 * V1-TESTING-GUIDE § 17 · Share — Discoverable: listing is separate from the
 * address. The publish/update/unshare rows are in publish.spec.ts and
 * journeys/01.
 */
test.describe('guide 17 · Share', () => {
  test('SHARE-03 — a visitor gets v1; an edit says so; Update ships v2 and the visitor gets it', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Two editions');
      const monaco = await writeFirstFile(page, 'index.html', '<h1>First edition</h1>');
      const { share, cruxId } = await shareFirst(page, api);
      await expect(share.getByText('v1', { exact: true })).toBeVisible();
      await expect(share.getByText(/^Published /)).toBeVisible();
      // Another client reads the address: the first edition.
      expect(await servedPage(api, cruxId)).toContain('First edition');
      // An edit: the pane says there is something to share, and when it was edited.
      await retype(page, monaco, '<h1>Second edition</h1>');
      await expect(share.getByText('Changes to share')).toBeVisible({ timeout: 30_000 });
      await expect(share.getByText(/^Edited /)).toBeVisible();
      await expect(share.getByText('v1', { exact: true })).toBeVisible();
      expect(await servedPage(api, cruxId)).toContain('First edition');
      // Update: v2, up to date, and the visitor now gets the second edition.
      await update(page, share);
      await expect(share.getByText('Up to date')).toBeVisible({ timeout: 60_000 });
      await expect(share.getByText('v2', { exact: true })).toBeVisible();
      await expect(share.getByText('Changes to share')).toHaveCount(0);
      expect(await servedPage(api, cruxId)).toContain('Second edition');
      expect(api.state.cruxes[cruxId]?.meta).toMatchObject({ publishedVersion: 2 });
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SHARE-07 — guestbook entries show on Live in the Store pane; Refresh reads new ones; deleting one asks and removes only it', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Guest diary');
      // A whole page on disk: the guestbook block goes before </body>.
      const folder = (await storedCrux(page, id)).projectFolder as string;
      writeFileSync(
        join(folder, 'index.html'),
        '<!doctype html><html><head><title>Diary</title></head><body><h1>Diary</h1></body></html>',
      );
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Add a guestbook', exact: true }).click();
      await expect(share.getByText('On index.html', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(() => existsSync(join(folder, 'guestbook.js'))).toBe(true);
      await expect(
        share.getByText(/Entries are in the Store pane under “guestbook”/),
      ).toBeVisible();
      const { cruxId } = await shareFirst(page, api);
      // Visitors of the shared site signed the book (the API's store for this Crux).
      const signed = (entries: { name: string; message: string }[]) => ({
        key: 'guestbook',
        value: { entries },
        mode: 'public' as const,
        visitorId: null,
        updatedAt: new Date().toISOString(),
      });
      api.state.store = [
        signed([{ name: 'Ana', message: 'Lovely garden.' }]),
        {
          key: 'seen',
          value: true,
          mode: 'protected',
          visitorId: 'visitor-ana00001',
          updatedAt: new Date().toISOString(),
        },
      ];
      const store = await openPanel(page, 'store', 'Toggle store');
      await store.getByTestId('store-source-live').click();
      const liveTable = store.getByTestId('store-live');
      const bookRow = liveTable.locator('tbody tr', { hasText: 'guestbook' });
      await expect(bookRow).toBeVisible({ timeout: 30_000 });
      await expect(bookRow).toContainText('Lovely garden.');
      await expect(bookRow).toContainText('public');
      // Private collaboration is not in the served page.
      expect(await servedPage(api, cruxId)).not.toContain('Send a message');
      // A new signature arrives; Refresh shows it.
      api.state.store[0] = signed([
        { name: 'Ana', message: 'Lovely garden.' },
        { name: 'Bo', message: 'Came back for the roses.' },
      ]);
      await store.getByTitle('Refresh').click();
      await expect(bookRow).toContainText('Came back for the roses.', { timeout: 30_000 });
      // Delete the book: the pane asks; confirm removes that key only, and only on Live.
      await bookRow.getByTitle('Delete this key from the live store').click();
      const ask = page.getByRole('dialog');
      await expect(ask).toContainText(/Delete "guestbook" from the live store/);
      await ask.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(bookRow).toHaveCount(0, { timeout: 30_000 });
      await expect(liveTable.locator('tbody tr', { hasText: 'seen' })).toBeVisible();
      expect(api.log.some((l) => l.startsWith(`DELETE /store/${cruxId}/guestbook`))).toBe(true);
      expect(api.state.store.map((e) => e.key)).toEqual(['seen']);
      // The visitor's actions belonged to this Crux's store, not the workspace's local one.
      await store.getByTestId('store-source-local').click();
      await expect(store.getByTestId('store-live')).toHaveCount(0);
      await expect(store.locator('tbody tr', { hasText: 'seen' })).toHaveCount(0);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SHARE-09 — the connection drops under an Update: the pane says so, the first edition stays live, a retry lands', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Flaky line');
      const monaco = await writeFirstFile(page, 'index.html', '<h1>Before</h1>');
      const { share, cruxId } = await shareFirst(page, api);
      const before = api.state.published[cruxId]!.map((f) => f.bytes.toString());
      await retype(page, monaco, '<h1>After</h1>');
      await expect(share.getByText('Changes to share')).toBeVisible({ timeout: 30_000 });
      // The socket dies while the upload is arriving.
      api.state.dropPublish = true;
      await update(page, share);
      await expect(share.getByRole('alert')).toContainText(/[a-z]/, { timeout: 60_000 });
      expect(api.log.some((l) => l.includes('/publish -> (dropped)'))).toBe(true);
      // Nothing half-arrived: the first edition is what visitors get, still v1 here.
      expect(api.state.published[cruxId]!.map((f) => f.bytes.toString())).toEqual(before);
      expect(await servedPage(api, cruxId)).toContain('Before');
      await expect(share.getByText('v1', { exact: true })).toBeVisible();
      await expect(share.getByText('Changes to share')).toBeVisible();
      // Back online: the retry ships the second edition.
      api.state.dropPublish = false;
      await update(page, share);
      await expect(share.getByText('Up to date')).toBeVisible({ timeout: 60_000 });
      await expect(share.getByRole('alert')).toHaveCount(0);
      await expect(share.getByText('v2', { exact: true })).toBeVisible();
      expect(await servedPage(api, cruxId)).toContain('After');
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SHARE-05 — Discoverable off removes the Crux from Explore but not from its address', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Quiet page');
      await writeFirstFile(page, 'index.html', '<h1>Quiet</h1>');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.cruxes)[0]!;
      const address = page.getByText(/\/tester\/[a-z0-9-]+$/);
      await expect(address).toBeVisible();

      // Shared is not listed: Discoverable starts off. Turning it on lists the Crux.
      const discoverable = share.getByRole('switch', { name: 'Discoverable' });
      await expect(discoverable).toHaveAttribute('aria-checked', 'false');
      await discoverable.click();
      await expect(discoverable).toHaveAttribute('aria-checked', 'true');
      await expect
        .poll(() => api.state.cruxes[cruxId]?.discoverable, { timeout: 30_000 })
        .toBe(true);
      // Room for Share beside Explore: the conversation and the files play no part here.
      for (const label of ['Toggle collaboration', 'Toggle artifacts'])
        if ((await panelPressed(page, label)) === 'true') await togglePanel(page, label);
      const explore = await showPane(page, 'Explore');
      await explore.getByPlaceholder(/moods and authors/).fill('quiet');
      await expect(explore.getByRole('link', { name: 'Quiet page' })).toBeVisible({
        timeout: 30_000,
      });

      // Off: gone from the listing, the setting reached the API, the address is unchanged.
      await discoverable.click();
      await expect(discoverable).toHaveAttribute('aria-checked', 'false');
      await expect
        .poll(() => api.state.cruxes[cruxId]?.discoverable, { timeout: 30_000 })
        .toBe(false);
      await explore.getByPlaceholder(/moods and authors/).fill('quiet ');
      await explore.getByPlaceholder(/moods and authors/).fill('quiet');
      await expect(explore.getByRole('link', { name: 'Quiet page' })).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(address).toBeVisible();
      await expect(page.getByText('Up to date')).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('SHARE-02/08 — declining the first-share question shares nothing; Unshare asks, cancel keeps it live, confirm takes it down', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Second thoughts');
      await writeFirstFile(page, 'index.html', '<h1>Maybe</h1>');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      // Decline: nothing goes out.
      await page.keyboard.press('Escape');
      await expect(ask).toHaveCount(0);
      await page.waitForTimeout(1500);
      expect(Object.keys(api.state.published)).toHaveLength(0);
      await expect(share.getByText('Up to date')).toHaveCount(0);
      // Now share for real.
      await share.getByRole('button', { name: 'Share', exact: true }).click();
      const again = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(again).toBeVisible({ timeout: 30_000 });
      await again.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(share.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.published)[0]!;
      // Unshare: cancel keeps it live.
      await share.getByRole('button', { name: 'Unshare', exact: true }).click();
      const unshare = page.getByRole('dialog', { name: 'Unshare this crux' });
      await expect(unshare).toContainText(/[a-z]/);
      await unshare.getByRole('button', { name: 'Cancel' }).click();
      await expect(share.getByText('Up to date')).toBeVisible();
      expect(api.state.published[cruxId]).toBeTruthy();
      // Confirm: offline, and the pane says so.
      await share.getByRole('button', { name: 'Unshare', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Unshare this crux' })
        .getByRole('button', { name: 'Unshare', exact: true })
        .click();
      await expect(share.getByText('Up to date')).toHaveCount(0, { timeout: 30_000 });
      await expect(share.getByRole('button', { name: 'Share', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(() => api.state.published[cruxId] ?? null).toBeNull();
    } finally {
      await app.close();
    }
  });
});
