import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { markVersion, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 11 · History — a Crux with many checkpoints stays
 * usable. The empty state and restores are journeys/01 and growth specs.
 */
test.describe('guide 11 · History', () => {
  test('GROW-07 — labels, a reverted deletion and the snapshots travel in the .crux; imported elsewhere the history opens offline', async () => {
    test.setTimeout(240_000);
    const first = await launchApp();
    const filename = join(first.dir, 'history.crux');
    try {
      const { app, page } = first;
      await enterGarden(page);
      const id = await createCrux(page, 'Kept history');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      await writeFirstFile(page, 'index.html', '<h1>One</h1>');
      await markVersion(page, 'First words');
      // A second file, marked; then deleted; then brought back by reverting.
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const input = page.getByRole('tree').getByRole('textbox');
      await input.fill('notes.md');
      await input.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await monaco.click();
      await page.keyboard.type('Keep these notes');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(() => existsSync(join(folder, 'notes.md'))).toBe(true);
      const history = await markVersion(page, 'With notes');
      const tree = page.getByRole('tree');
      await tree.getByText('notes.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('notes.md', { exact: true })).toHaveCount(0);
      await expect.poll(() => existsSync(join(folder, 'notes.md'))).toBe(false);
      await history.getByText('With notes', { exact: true }).click();
      const banner = page.getByRole('region', { name: 'Viewing a snapshot' });
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await banner.getByRole('button', { name: 'Revert', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Revert', exact: true }).click();
      await expect(banner).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(() => existsSync(join(folder, 'notes.md')), { timeout: 30_000 }).toBe(true);
      expect(readFileSync(join(folder, 'notes.md'), 'utf8')).toBe('Keep these notes');
      await expect(tree.getByText('notes.md', { exact: true })).toBeVisible({ timeout: 30_000 });
      // Export the whole Crux.
      const exportPane = await openPanel(page, 'export', 'Toggle export');
      await expect(exportPane.getByText(/\d+ snapshots?/)).toBeVisible();
      await app.evaluate(({ session }, filename) => {
        session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
          item.setSavePath(filename),
        );
      }, filename);
      await exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click();
      await expect.poll(() => existsSync(filename), { timeout: 60_000 }).toBe(true);
    } finally {
      await first.app.close();
    }
    // A fresh installation, no network: the history is there and opens.
    const second = await launchApp();
    try {
      const { page } = second;
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import .crux file', exact: true }).click();
      await (await chooser).setFiles(filename);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const folder = (await storedCrux(page, id)).projectFolder as string;
      await expect.poll(() => existsSync(join(folder, 'notes.md')), { timeout: 60_000 }).toBe(true);
      expect(readFileSync(join(folder, 'notes.md'), 'utf8')).toBe('Keep these notes');
      const history = await openPanel(page, 'history', 'Toggle history');
      await expect(history.getByText('First words', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(history.getByText('With notes', { exact: true })).toBeVisible();
      // A labelled checkpoint opens as a snapshot with its own files, and Back returns.
      await history.getByText('First words', { exact: true }).click();
      await expect(page.getByRole('region', { name: 'Viewing a snapshot' })).toBeVisible({
        timeout: 30_000,
      });
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('tree').getByText('notes.md', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Back to current' }).first().click();
      await expect(page.getByRole('region', { name: 'Viewing a snapshot' })).toHaveCount(0);
      await expect(page.getByRole('tree').getByText('notes.md', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await second.app.close();
    }
  });

  test('GROW-06 — twelve versions list, scroll and open without freezing', async () => {
    test.setTimeout(240_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Many versions');
      const monaco = await writeFirstFile(page, 'index.html', '<h1>v0</h1>');
      for (let i = 1; i <= 12; i++) {
        await monaco.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(`<h1>v${i}</h1>`);
        await page.keyboard.press('ControlOrMeta+s');
        await markVersion(page, `Version ${i}`);
      }
      const history = page.getByTestId('pane-body-history');
      await expect(history.getByText('Version 12', { exact: true })).toBeVisible();
      await expect(history.getByText('Version 1', { exact: true })).toBeVisible();
      // The pane still answers: a card opens its snapshot view and Back returns.
      await history.getByText('Version 3', { exact: true }).click();
      await expect(page.getByRole('region', { name: 'Viewing a snapshot' })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'Back to current' }).first().click();
      await expect(page.getByRole('region', { name: 'Viewing a snapshot' })).toHaveCount(0);
      await expect(page.locator('.monaco-editor').first()).toContainText('v12');
    } finally {
      await app.close();
    }
  });
});
