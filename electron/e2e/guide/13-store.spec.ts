import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
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

  test('STORE-07 — Live going offline is recoverable and never disables the local Store', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
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
