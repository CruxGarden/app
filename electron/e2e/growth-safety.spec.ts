import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { addArtifact, createCrux, enterGarden, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

for (const action of ['Revert', 'Branch'] as const) {
  test(`${action} refuses a failed safety snapshot and preserves current files through retry and restart`, async () => {
    let launch = await launchApp();
    const dir = launch.dir;
    try {
      const { page } = launch;
      await enterGarden(page);
      const id = await createCrux(page, `Safe ${action}`);
      const meta = await storedCrux(page, id);
      await addArtifact(page, 'notes.txt');
      const editor = page.locator('.monaco-editor').first();
      await editor.click();
      await page.keyboard.type('Earlier version');
      await page.keyboard.press('ControlOrMeta+s');
      const disk = () => readFileSync(join(meta.projectFolder, 'notes.txt'), 'utf8');
      await expect.poll(disk).toBe('Earlier version');
      await togglePanel(page, 'Toggle history');
      const history = page.getByTestId('pane-body-history');
      await history.getByRole('button', { name: 'Mark version', exact: true }).click();
      await history.getByPlaceholder('Label (optional)').fill('Earlier');
      await history.getByPlaceholder('Label (optional)').press('Enter');
      await expect(history.getByText('Earlier', { exact: true })).toBeVisible();
      await editor.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('Current work must survive');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(disk).toBe('Current work must survive');
      await history.getByRole('button').filter({ hasText: 'Earlier' }).first().click();
      await expect(page.getByText('read-only', { exact: true })).toBeVisible();
      await page.evaluate(() =>
        window.electronAPI!.sqlite.run(
          "CREATE TRIGGER refuse_safety BEFORE INSERT ON cruxes WHEN NEW.kind = 'snapshot' BEGIN SELECT RAISE(ABORT, 'Safety snapshot refused'); END",
        ),
      );
      if (action === 'Branch') {
        await page.getByRole('button', { name: 'Branch', exact: true }).click();
        await page.getByRole('textbox', { name: 'Branch label' }).fill('New direction');
      }
      const restore = async () => {
        if (action === 'Revert') {
          await page.getByRole('button', { name: 'Revert', exact: true }).click();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Revert', exact: true })
            .click();
        } else {
          await page.getByRole('button', { name: 'Create branch', exact: true }).click();
        }
      };
      await restore();
      const error = page.getByRole('alertdialog', { name: 'Restore failed' });
      await expect(error).toContainText('Could not save a safety snapshot');
      expect(disk()).toBe('Current work must survive');
      await error.getByRole('button', { name: 'OK', exact: true }).click();
      await expect(page.getByText('read-only', { exact: true })).toBeVisible();
      if (action === 'Branch')
        await expect(page.getByRole('textbox', { name: 'Branch label' })).toHaveValue(
          'New direction',
        );
      await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_safety'));
      await restore();
      await expect.poll(disk).toBe('Earlier version');
      await expect(page.getByText('read-only', { exact: true })).toHaveCount(0);
      const label = action === 'Revert' ? 'Before revert' : 'Before branch';
      await expect(history.getByText(label, { exact: true })).toBeVisible();
      await history.getByRole('button').filter({ hasText: label }).first().click();
      await expect(editor).toContainText('Current work must survive');
      await history.getByRole('button', { name: 'Back to current' }).click();
      await launch.app.close();
      launch = await launchApp({ dir });
      await launch.page.getByRole('button', { name: /enter/i }).click();
      await expect(launch.page.locator('[data-workspace-id]')).toBeVisible();
      expect(disk()).toBe('Earlier version');
      const reopenedHistory = launch.page.getByTestId('pane-body-history');
      if (!(await reopenedHistory.isVisible())) await togglePanel(launch.page, 'Toggle history');
      await reopenedHistory.getByRole('button').filter({ hasText: label }).first().click();
      await launch.page.getByRole('tree').getByText('notes.txt', { exact: true }).click();
      await expect(launch.page.locator('.monaco-editor').first()).toContainText(
        'Current work must survive',
      );
    } finally {
      await launch.app.close();
    }
  });
}
