import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Two panes with no other coverage. Metadata: title, description, tags and
 * kind are edited in the pane and come back from the garden's own list (the
 * Home Garden card) and from the reopened pane. Store (Local): keys are added,
 * valued, re-moded, deleted, cleared, exported and imported. The export is
 * captured in-page (the blob handed to the anchor) rather than via the OS.
 */
async function armBlobCapture(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __blobs?: Blob[] };
    if (w.__blobs) return;
    w.__blobs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      if (b instanceof Blob) w.__blobs!.push(b);
      return orig(b);
    };
    // a download anchor's click would ask the OS; keep the blob and skip it
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.download) click.call(this);
    };
  });
}

async function lastBlob(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const w = window as unknown as { __blobs: Blob[] };
    const b = w.__blobs[w.__blobs.length - 1];
    const bytes = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

/** Open a pane if it is closed; never toggle an open one shut. */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}

/** A Metadata field row: the labelled block holding its control. */
function metaRow(page: Page, label: string): Locator {
  return page.getByTestId('pane-body-details').locator(`div:has(> span:text-is("${label}"))`);
}

/** The table row for one store key. */
/** One tag chip (its text plus the remove button). */
function tagChip(tags: Locator, tag: string): Locator {
  return tags.locator('span', { hasText: new RegExp(`^${tag}`) });
}

function storeRow(page: Page, key: string): Locator {
  return page.getByTestId('pane-body-store').locator('tbody tr', {
    has: page.locator(`td:text-is("${key}")`),
  });
}

test.describe('metadata and store panes', () => {
  test.setTimeout(150_000);

  test('metadata edits persist; the local store adds, edits, deletes, clears and round-trips a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crux-store-'));
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Toggle metadata' })).toBeVisible({
        timeout: 30_000,
      });

      // ── Metadata: title, description, tags, kind ──
      await ensurePane(page, 'details', 'Toggle metadata');
      const title = metaRow(page, 'Title');
      await expect(title).toContainText('My Crux');
      await title.getByRole('button').click();
      await title.getByRole('textbox').fill('Solar Notes');
      await title.getByRole('textbox').press('Enter');
      await expect(title).toContainText('Solar Notes');
      await expect(title.getByRole('textbox')).toHaveCount(0);

      const description = metaRow(page, 'Description');
      await expect(description).toContainText('empty');
      await description.getByRole('button').click();
      await description.getByRole('textbox').fill('A field guide to the garden.');
      // multiline commits on blur
      await description.getByRole('textbox').press('Tab');
      await expect(description).toContainText('A field guide to the garden.');

      const tags = metaRow(page, 'Tags');
      const tagInput = tags.getByPlaceholder('add tags...');
      await tagInput.fill('Solar Punk');
      await tagInput.press('Enter');
      await expect(tagChip(tags, 'solar-punk')).toBeVisible();
      await tags.getByRole('textbox').fill('notes');
      await tags.getByRole('textbox').press('Enter');
      await expect(tagChip(tags, 'notes')).toBeVisible();
      // remove the first tag; the second stays
      await tagChip(tags, 'solar-punk').getByRole('button').click();
      await expect(tagChip(tags, 'solar-punk')).toHaveCount(0);
      await expect(tagChip(tags, 'notes')).toBeVisible();

      // kind cycles auto → Web App → Page
      const kind = metaRow(page, 'Kind').getByRole('button');
      await expect(kind).toHaveText(/auto/i);
      await kind.click();
      await expect(kind).toHaveText(/web app/i);
      await kind.click();
      await expect(kind).toHaveText(/^page$/i);

      // The Home Garden lists what the garden holds: the card carries the edits
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      const card = page.getByRole('button', { name: 'Open Solar Notes' });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText('A field guide to the garden.');
      await expect(card).toContainText('Page');
      await expect(page.getByRole('button', { name: 'Open My Crux' })).toHaveCount(0);

      // and the reopened pane agrees (wait for the workspace's panes to mount
      // before asking about one, or the toggle would shut an open pane)
      await card.click();
      await expect(page.getByRole('button', { name: 'Toggle metadata' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator('[data-testid^="pane-body-"]').first()).toBeVisible({
        timeout: 30_000,
      });
      await ensurePane(page, 'details', 'Toggle metadata');
      await expect(metaRow(page, 'Title')).toContainText('Solar Notes');
      await expect(metaRow(page, 'Description')).toContainText('A field guide to the garden.');
      await expect(tagChip(metaRow(page, 'Tags'), 'notes')).toBeVisible();
      await expect(metaRow(page, 'Kind').getByRole('button')).toHaveText(/^page$/i);

      // ── Store (Local): add, value, mode, delete ──
      await ensurePane(page, 'store', 'Toggle store');
      const store = page.getByTestId('pane-body-store');
      await expect(store.getByRole('tab', { name: 'Local' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // no published crux → no live store to read
      await expect(store.getByRole('tab', { name: 'Live' })).toBeDisabled();
      await expect(store.getByText('No store entries yet')).toBeVisible();
      await expect(store.getByTestId('store-export')).toBeDisabled();

      await store.getByRole('button', { name: '+ Add key' }).click();
      const keyInput = store.getByPlaceholder('key name');
      await keyInput.fill('score');
      await keyInput.press('Enter');
      const score = storeRow(page, 'score');
      await expect(score).toBeVisible();
      await expect(score).toContainText('null');
      await expect(score.getByRole('button', { name: 'protected' })).toBeVisible();
      await expect(store).toContainText('1 key');

      // value cell: JSON is stored as JSON
      await score.getByTitle('Click to edit').click();
      const valueInput = score.getByRole('textbox');
      await valueInput.fill('{"points":42}');
      await valueInput.press('Enter');
      await expect(score).toContainText('{"points":42}');
      await expect(score.getByRole('textbox')).toHaveCount(0);

      // mode toggles between the two buckets
      await score.getByRole('button', { name: 'protected' }).click();
      await expect(score.getByRole('button', { name: 'public' })).toBeVisible();

      // a second key with a plain-string value
      await store.getByRole('button', { name: '+ Add key' }).click();
      await store.getByPlaceholder('key name').fill('greeting');
      await store.getByRole('button', { name: 'Add', exact: true }).click();
      const greeting = storeRow(page, 'greeting');
      await greeting.getByTitle('Click to edit').click();
      await greeting.getByRole('textbox').fill('hello');
      await greeting.getByRole('textbox').press('Enter');
      await expect(greeting).toContainText('hello');
      await expect(store).toContainText('2 keys');

      // delete asks first; cancel keeps, confirm removes
      await greeting.getByRole('button', { name: 'Delete key' }).click();
      await expect(page.getByText('Delete key "greeting"?')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await expect(greeting).toBeVisible();
      await greeting.getByRole('button', { name: 'Delete key' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(greeting).toHaveCount(0);
      await expect(store).toContainText('1 key');

      // ── Export → Clear all → Import: the file brings the key back ──
      await armBlobCapture(page);
      await store.getByTestId('store-export').click();
      await expect
        .poll(
          () => page.evaluate(() => (window as unknown as { __blobs: Blob[] }).__blobs.length),
          {
            timeout: 15_000,
          },
        )
        .toBe(1);
      const exported = await lastBlob(page);
      const doc = JSON.parse(exported.toString('utf8'));
      expect(doc.format).toBe('crux-store');
      expect(doc.version).toBe(1);
      expect(doc.public).toEqual({ score: { points: 42 } });
      const storeFile = join(dir, 'solar-notes-store.json');
      writeFileSync(storeFile, exported);

      await store.getByRole('button', { name: 'Clear all' }).click();
      await expect(page.getByText('Clear all store entries?')).toBeVisible();
      // the export above is our copy — clear without another
      await page.getByRole('dialog').getByRole('button', { name: 'Clear without a copy' }).click();
      await expect(store.getByText('No store entries yet')).toBeVisible();
      await expect(store).toContainText('0 keys');

      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        store.getByTestId('store-import').click(),
      ]);
      await chooser.setFiles(storeFile);
      await expect(storeRow(page, 'score')).toBeVisible({ timeout: 15_000 });
      await expect(storeRow(page, 'score')).toContainText('{"points":42}');
      await expect(storeRow(page, 'score').getByRole('button', { name: 'public' })).toBeVisible();
      await expect(store).toContainText('1 key');

      // importing over existing rows asks: merge keeps one row per key
      const [again] = await Promise.all([
        page.waitForEvent('filechooser'),
        store.getByTestId('store-import').click(),
      ]);
      await again.setFiles(storeFile);
      await expect(page.getByText('Import into the local store')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).click();
      await expect(storeRow(page, 'score')).toHaveCount(1);
      await expect(store).toContainText('1 key');
    } finally {
      await app.close();
    }
  });
});
