import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { enableAdvancedMode, openPanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 13 · Crux Store — the rows metadata-store, store-hooks
 * and order-desk left open: every value type, bad input, and Live going away.
 */
const row = (store: ReturnType<Page['getByTestId']>, key: string) =>
  store.locator('tbody tr', { has: store.page().locator(`td:text-is("${key}")`) });

async function addKey(store: ReturnType<Page['getByTestId']>, key: string, value?: string) {
  await store.getByRole('button', { name: '+ Add key' }).click();
  const input = store.getByPlaceholder('key name');
  await input.fill(key);
  await input.press('Enter');
  const r = row(store, key);
  await expect(r).toBeVisible();
  if (value !== undefined) {
    await r.getByTitle('Click to edit').click();
    const box = r.getByRole('textbox');
    await box.fill(value);
    await box.press('Enter');
  }
  return r;
}

test.describe('guide 13 · Crux Store', () => {
  test('STORE-01 — string, number, Boolean, object and array keep their types', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      const id = await createCrux(page, 'Typed store');
      const store = await openPanel(page, 'store', 'Toggle store');
      await addKey(store, 'name', 'Moss');
      await addKey(store, 'count', '42');
      await addKey(store, 'open', 'true');
      await addKey(store, 'shape', '{"points":3}');
      await addKey(store, 'list', '[1,2,3]');
      // The rows show what was typed…
      await expect(row(store, 'count')).toContainText('42');
      await expect(row(store, 'open')).toContainText('true');
      await expect(row(store, 'list')).toContainText('[1,2,3]');
      // …and the database holds the types, not five strings.
      const values = await page.evaluate(async (id) => {
        const rows = (await window.electronAPI!.sqlite.all(
          'SELECT key, value FROM store WHERE crux_id = ? ORDER BY key',
          [id],
        )) as { key: string; value: string }[];
        return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
      }, id);
      expect(values).toEqual({
        count: 42,
        list: [1, 2, 3],
        name: 'Moss',
        open: true,
        shape: { points: 3 },
      });
      // Editing a number keeps it a number.
      const count = row(store, 'count');
      await count.getByTitle('Click to edit').click();
      await count.getByRole('textbox').fill('43');
      await count.getByRole('textbox').press('Enter');
      await expect(count).toContainText('43');
    } finally {
      await app.close();
    }
  });

  test('STORE-02 — malformed JSON stays text, a duplicate key replaces in place, an empty value is kept empty', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      await createCrux(page, 'Careful store');
      const store = await openPanel(page, 'store', 'Toggle store');
      // Malformed JSON is stored as the text typed, not lost and not an error.
      const note = await addKey(store, 'note', '{not json');
      await expect(note).toContainText('{not json');
      // The same key again does not make a second row.
      await store.getByRole('button', { name: '+ Add key' }).click();
      await store.getByPlaceholder('key name').fill('note');
      await store.getByPlaceholder('key name').press('Enter');
      await expect(row(store, 'note')).toHaveCount(1);
      await expect(store).toContainText('1 key');
      // An empty value is an empty string, explicitly.
      await note.getByTitle('Click to edit').click();
      await note.getByRole('textbox').fill('');
      await note.getByRole('textbox').press('Enter');
      await expect(note.getByRole('textbox')).toHaveCount(0);
      await expect(store).toContainText('1 key');
    } finally {
      await app.close();
    }
  });

  test('STORE-05 — a visitor value shows on Live after a refresh; local test values never cross over', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      await createCrux(page, 'Answer sheet');
      await writeFirstFile(page, 'index.html', '<h1>Sheet</h1>');
      const store = await openPanel(page, 'store', 'Toggle store');
      await addKey(store, 'draft', 'local only');
      await expect(store.getByTestId('store-source-live')).toBeDisabled();
      // Share it, then a visitor of the shared site writes an answer through the API.
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.published)[0]!;
      api.state.store = [];
      const wrote = await fetch(`${api.url}/store/${cruxId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'from a visitor', mode: 'public' }),
      });
      expect(wrote.status).toBe(200);
      // Live: the visitor's value, and not the local draft.
      await store.getByTestId('store-source-live').click();
      const live = store.getByTestId('store-live');
      await store.getByTitle('Refresh').click();
      await expect(live.locator('tbody tr', { hasText: 'answer' })).toContainText(
        'from a visitor',
        {
          timeout: 30_000,
        },
      );
      await expect(live.locator('tbody tr', { hasText: 'draft' })).toHaveCount(0);
      // Local: the draft, and not the visitor's value — before and after a refresh.
      await store.getByTestId('store-source-local').click();
      await expect(row(store, 'draft')).toContainText('local only');
      await expect(store.locator('tbody tr', { hasText: 'answer' })).toHaveCount(0);
      await store.getByTitle('Refresh').click();
      await expect(row(store, 'draft')).toContainText('local only');
      await expect(store.locator('tbody tr', { hasText: 'answer' })).toHaveCount(0);
      await expect(store).toContainText('1 key');
      // The local draft never reached the API's store.
      expect(api.state.store.map((e) => e.key)).toEqual(['answer']);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('STORE-06 — a per-visitor key is marked with its visitor; deleting it asks and removes only that row', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      await createCrux(page, 'Daily game');
      await writeFirstFile(page, 'index.html', '<h1>Game</h1>');
      const store = await openPanel(page, 'store', 'Toggle store');
      await addKey(store, 'local-note', 'stays');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.published)[0]!;
      // The mock seeds a public leaderboard and one visitor's protected record.
      await store.getByTestId('store-source-live').click();
      const live = store.getByTestId('store-live');
      const played = live.locator('tbody tr', { hasText: 'played:2026-09-06' });
      const board = live.locator('tbody tr', { hasText: 'leaderboard:2026-09-06' });
      await expect(played).toBeVisible({ timeout: 30_000 });
      await expect(played).toContainText('· visitor-');
      await expect(played.getByTitle('Visitor visitor-a1b2c3d4')).toBeVisible();
      await expect(played).toContainText('protected');
      await expect(board).toContainText('public');
      await expect(board.getByTitle(/^Visitor /)).toHaveCount(0);
      // Delete the visitor's row: cancel keeps it; confirm removes it and nothing else.
      await played.getByTitle('Delete this key from the live store').click();
      const confirm = page.getByRole('dialog');
      await expect(confirm).toContainText(/Every visitor's value for it goes too/);
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(played).toBeVisible();
      await played.getByTitle('Delete this key from the live store').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(played).toHaveCount(0, { timeout: 30_000 });
      await expect(board).toBeVisible();
      expect(api.log.filter((l) => l.startsWith(`DELETE /store/${cruxId}/played`))).toHaveLength(1);
      expect(api.state.store!.map((e) => e.key)).toEqual(['leaderboard:2026-09-06']);
      // The local store is not the live store: its key is still there.
      await store.getByTestId('store-source-local').click();
      await expect(row(store, 'local-note')).toContainText('stays');
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('STORE-07 — Live going offline is recoverable and never disables the local Store', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await enableAdvancedMode(page);
      await createCrux(page, 'Live store');
      await writeFirstFile(page, 'index.html', '<h1>Store</h1>');
      const store = await openPanel(page, 'store', 'Toggle store');
      await addKey(store, 'local-only', 'kept');
      // Live needs a shared Crux: share it.
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });

      const live = store.getByTestId('store-source-live');
      await expect(live).toBeEnabled();
      await live.click();
      await expect(store.getByTestId('store-live')).toBeVisible();
      // The API goes away.
      await api.close();
      await store.getByTitle('Refresh').click();
      await expect(store.getByText('Could not read the live store')).toBeVisible({
        timeout: 30_000,
      });
      // Back to Local: the local key is still there and still editable.
      await store.getByTestId('store-source-local').click();
      await expect(row(store, 'local-only')).toContainText('kept');
      await addKey(store, 'still-works', 'yes');
      await expect(store).toContainText('2 keys');
    } finally {
      await app.close();
    }
  });
});
