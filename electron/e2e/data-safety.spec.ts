import { closeWorkspace } from './journeys/journey-helpers';
import { togglePanel, showPane, hidePane } from './panel-helpers';
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Data safety: the archives the app writes are the archives it reads back.
 * Export a crux (.crux) and the garden (.garden); import the crux as a copy;
 * wipe the garden; restore it from the file. Downloads are captured in-page
 * (the blob handed to the anchor) rather than through the OS.
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
/** Open a pane if it is closed; never toggle an open one shut. */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false))) await togglePanel(page, toggle);
  await expect(body).toBeVisible({ timeout: 30_000 });
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

/** Settings → Garden, as a pane: open it and expand the Garden section once. */
async function openGardenSettings(page: Page) {
  const settings = await showPane(page, 'Settings');
  if (!(await settings.getByRole('button', { name: 'Wipe garden' }).isVisible()))
    await settings.locator('h2', { hasText: /^Garden$/ }).click();
  return settings;
}

test.describe('data safety: export, import, wipe, restore', () => {
  test.setTimeout(240_000);

  test('a crux and the garden round-trip through their files; a wiped garden comes back whole', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crux-archives-'));
    const { app, page } = await launchApp();
    try {
      // A restored layout brings every pane back; give them room to show their contents.
      await page.setViewportSize({ width: 2000, height: 1200 });
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'Add files', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Keep me</h1>');
      await page.keyboard.press('ControlOrMeta+s');
      // a labelled snapshot, so history has something to carry
      if (
        !(await page
          .getByTestId('pane-body-history')
          .isVisible()
          .catch(() => false))
      )
        await togglePanel(page, 'Toggle growth');
      const history = page.getByTestId('pane-body-history');
      await history.getByRole('button', { name: 'Mark version', exact: true }).click();
      await history.getByPlaceholder('Label (optional)').fill('v1');
      await history.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(history.getByText('v1', { exact: true })).toBeVisible({ timeout: 30_000 });

      await armBlobCapture(page);

      // ── Export the crux (.crux) ──
      if (
        !(await page
          .getByTestId('pane-body-export')
          .isVisible()
          .catch(() => false))
      )
        await togglePanel(page, 'Toggle export');
      await page.getByRole('button', { name: 'Export Crux' }).click();
      const blobs = () =>
        page.evaluate(() => (window as unknown as { __blobs: Blob[] }).__blobs.length);
      await expect.poll(blobs, { timeout: 30_000 }).toBe(1);
      const cruxFile = join(dir, 'my-crux.crux');
      writeFileSync(cruxFile, await lastBlob(page));

      // ── Export the garden (.garden) ──
      const settings = await showPane(page, 'Settings');
      await settings.locator('h2', { hasText: /^Garden$/ }).click();
      await settings.getByRole('button', { name: 'Export garden' }).click();
      await expect(settings.getByText('Export complete')).toBeVisible({ timeout: 60_000 });
      await expect.poll(blobs, { timeout: 30_000 }).toBe(2);
      const gardenFile = join(dir, 'garden.garden');
      writeFileSync(gardenFile, await lastBlob(page));
      await hidePane(page, 'Settings');

      // ── Import the .crux as a copy: a second crux with the same file ──
      // Close the first workspace from the switcher (its Home card stays);
      // the switcher lists open workspaces by the Garden's members, so each
      // one is closed from inside it.
      await closeWorkspace(page, 'My Crux');
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Import Crux, tool or Mood' }).click(),
      ]);
      await chooser.setFiles(cruxFile);
      await expect(page.getByRole('button', { name: 'Add panel' })).toBeVisible({
        timeout: 60_000,
      });
      await ensurePane(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('index.html')).toBeVisible({ timeout: 30_000 });

      // ── Wipe the garden: refused while a workspace is open (ADR 0018), then typed confirmation ──
      await openGardenSettings(page);
      await expect(page.getByRole('button', { name: 'Wipe garden' })).toBeDisabled();
      await page.getByPlaceholder('delete me').fill('delete me');
      await page.getByRole('button', { name: 'Wipe garden' }).click();
      await page.getByRole('button', { name: 'Wipe without a copy', exact: true }).click();
      await expect(page.getByText(/Close all open Crux workspaces/)).toBeVisible({
        timeout: 15_000,
      });
      await page.keyboard.press('Escape');
      await hidePane(page, 'Settings');
      // The imported copy is the active workspace; the switcher offers
      // "Close current workspace" for it (its title is shared with the original).
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page.getByRole('button', { name: 'Close current workspace', exact: true }).click();
      const closing = page.getByRole('dialog', { name: 'Close workspace' });
      await expect(closing).toBeVisible();
      await closing.getByRole('button', { name: 'Save and close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Open My Crux/ })).toHaveCount(2, {
        timeout: 15_000,
      });
      await openGardenSettings(page);
      await page.getByPlaceholder('delete me').fill('delete me');
      await page.getByRole('button', { name: 'Wipe garden' }).click();
      await page.getByRole('button', { name: 'Wipe without a copy', exact: true }).click();
      await expect(page.getByRole('button', { name: /enter/i })).toBeVisible({ timeout: 60_000 });

      // ── Restore from the .garden file: the crux is back, with its file ──
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Restore from .garden file').click();
      const [gardenChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Choose file' }).click(),
      ]);
      await gardenChooser.setFiles(gardenFile);
      // The restored garden remembers its open workspace (ADR 0018): it may land
      // straight in the builder, or on the Home Garden — either is the garden back.
      const toggleArtifacts = page.getByRole('button', { name: 'Toggle artifacts' });
      const openCard = page.getByRole('button', { name: 'Open My Crux' });
      await expect(toggleArtifacts.or(openCard).first()).toBeVisible({ timeout: 90_000 });
      if (await openCard.isVisible().catch(() => false)) await openCard.click();
      await expect(toggleArtifacts).toBeVisible({ timeout: 60_000 });
      await ensurePane(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('index.html')).toBeVisible({ timeout: 30_000 });
      if (
        !(await page
          .getByTestId('pane-body-history')
          .isVisible()
          .catch(() => false))
      )
        await togglePanel(page, 'Toggle growth');
      await expect(
        page.getByTestId('pane-body-history').getByText('v1', { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
    }
  });
});
