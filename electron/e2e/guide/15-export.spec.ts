import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 15 · Export — a truncated archive is refused and the
 * garden is untouched. The formats and copies are private-archive-ui and
 * export specs.
 */
test.describe('guide 15 · Export', () => {
  test('EXPORT-05 — a truncated .crux is refused with words; existing work stays intact', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Whole one');
      await writeFirstFile(page, 'index.html', '<h1>Whole</h1>');
      const exportPane = await openPanel(page, 'export', 'Toggle export');
      const filename = join(dir, 'whole.crux');
      await app.evaluate(({ session }, filename) => {
        session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
          item.setSavePath(filename),
        );
      }, filename);
      await exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click();
      await expect.poll(() => existsSync(filename), { timeout: 30_000 }).toBe(true);
      // Cut the archive short.
      const bytes = readFileSync(filename);
      const truncated = join(dir, 'truncated.crux');
      writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length / 2)));
      await goHome(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import .crux file', exact: true }).click();
      await (await chooser).setFiles(truncated);
      await expect(page.getByRole('alertdialog')).toContainText(/[a-z]/, { timeout: 60_000 });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // Still one Crux, still whole.
      await expect(
        page.getByTestId('pane-body-home').getByRole('button', { name: /^Open / }),
      ).toHaveCount(1);
      await page.getByRole('button', { name: 'Open Whole one' }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Whole', {
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  });
});
