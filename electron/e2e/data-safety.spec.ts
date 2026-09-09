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
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
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

test.describe('data safety: export, import, wipe, restore', () => {
  test.setTimeout(240_000);

  test('a crux and the garden round-trip through their files; a wiped garden comes back whole', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crux-archives-'));
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
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
        await page.getByRole('button', { name: 'Toggle history' }).click();
      await page
        .getByRole('button', { name: /snapshot/i })
        .first()
        .click();
      const label = page.getByPlaceholder('Label (optional)');
      await label.fill('v1');
      await label.press('Enter');
      await expect(page.getByText('v1', { exact: true })).toBeVisible({ timeout: 30_000 });

      await armBlobCapture(page);

      // ── Export the crux (.crux) ──
      if (
        !(await page
          .getByTestId('pane-body-export')
          .isVisible()
          .catch(() => false))
      )
        await page.getByRole('button', { name: 'Toggle export' }).click();
      await page.getByRole('button', { name: 'Export Crux' }).click();
      const blobs = () =>
        page.evaluate(() => (window as unknown as { __blobs: Blob[] }).__blobs.length);
      await expect.poll(blobs, { timeout: 30_000 }).toBe(1);
      const cruxFile = join(dir, 'my-crux.crux');
      writeFileSync(cruxFile, await lastBlob(page));

      // ── Export the garden (.garden) ──
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.locator('h2', { hasText: /^Garden$/ }).click();
      await page.getByRole('button', { name: 'Export garden' }).click();
      await expect(page.getByText('Export complete')).toBeVisible({ timeout: 60_000 });
      await expect.poll(blobs, { timeout: 30_000 }).toBe(2);
      const gardenFile = join(dir, 'garden.garden');
      writeFileSync(gardenFile, await lastBlob(page));
      await page.keyboard.press('Escape');

      // ── Import the .crux as a copy: a second crux with the same file ──
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Import .crux file' }).click(),
      ]);
      await chooser.setFiles(cruxFile);
      await expect(page.getByRole('button', { name: 'Toggle artifacts' })).toBeVisible({
        timeout: 60_000,
      });
      await ensurePane(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('index.html')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByRole('button', { name: /^Open My Crux/ })).toHaveCount(2, {
        timeout: 15_000,
      });

      // ── Wipe the garden: refused while workspaces are open (ADR 0018), then typed confirmation ──
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^Garden$/ }).click();
      await expect(page.getByRole('button', { name: 'Wipe garden' })).toBeDisabled();
      await page.getByPlaceholder('delete me').fill('delete me');
      await page.getByRole('button', { name: 'Wipe garden' }).click();
      await expect(page.getByText(/Close all open Crux workspaces/)).toBeVisible({
        timeout: 15_000,
      });
      await page.keyboard.press('Escape');
      // close both workspaces from the switcher
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      for (let i = 0; i < 2; i++) {
        await page
          .getByRole('button', { name: /^Close .* workspace$/ })
          .first()
          .click();
        const closeDlg = page.getByRole('dialog', { name: 'Close workspace' });
        if (await closeDlg.isVisible().catch(() => false))
          await page.getByRole('button', { name: 'Save and close', exact: true }).click();
        await page.waitForTimeout(500);
        if (
          i === 0 &&
          !(await page
            .getByRole('button', { name: /^Close .* workspace$/ })
            .first()
            .isVisible()
            .catch(() => false))
        )
          await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      }
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^Garden$/ }).click();
      await page.getByPlaceholder('delete me').fill('delete me');
      await page.getByRole('button', { name: 'Wipe garden' }).click();
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
        await page.getByRole('button', { name: 'Toggle history' }).click();
      await expect(page.getByText('v1', { exact: true })).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
    }
  });
});
