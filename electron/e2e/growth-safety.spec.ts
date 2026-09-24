import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { addArtifact, createCrux, enterGarden, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

for (const action of ['Revert', 'Branch'] as const) {
  test(`${action} refuses a failed recovery copy and preserves current files through retry and restart`, async () => {
    let launch = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
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
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Please write hello');
      await input.press('Enter');
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible();
      const unmarked = await storedCrux(page, id);
      expect(unmarked.messages.length).toBeGreaterThan(0);

      await history.getByRole('button').filter({ hasText: 'Earlier' }).first().click();
      await expect(page.getByText('read-only', { exact: true })).toBeVisible();
      await page.evaluate(() =>
        window.electronAPI!.sqlite.run(
          "CREATE TRIGGER refuse_safety BEFORE UPDATE ON edit_history BEGIN SELECT RAISE(ABORT, 'Recovery refused'); END",
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
      await expect(error).toContainText('Could not save a safety copy');
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
      expect(
        await page.evaluate(
          (id) =>
            window.electronAPI!.sqlite.all(
              "SELECT id FROM dimensions WHERE source_id=? AND type='growth'",
              [id],
            ),
          id,
        ),
      ).toHaveLength(1);
      const recovery = await page.evaluate(async (id) => {
        const history = await window.electronAPI!.sqlite.fileContent!.history(id);
        return history.checkpoints.filter((item) => item.workspace).at(-1)!;
      }, id);
      expect(recovery.workspace!.messages).toEqual(unmarked.messages);
      const retainedParent = recovery.workspace!.parentId!;
      for (const operation of ['trash', 'purge'] as const) {
        const refusal = await page.evaluate(
          async ({ retainedParent, operation }) => {
            try {
              const db = window.electronAPI!.sqlite;
              if (operation === 'trash') await db.setCruxTrashed!(retainedParent, true);
              else await db.deleteCrux!(retainedParent);
              return 'unexpected deletion';
            } catch (error) {
              return String(error);
            }
          },
          { retainedParent, operation },
        );
        expect(refusal).toContain('recovery copy');
      }

      await history.getByRole('button', { name: 'Edit history', exact: true }).click();
      const row = history.locator(`[data-checkpoint-id="${recovery.id}"]`);
      await row.getByRole('button', { name: /Inspect recovery/ }).click();
      await expect(row.getByText('notes.txt', { exact: true })).toBeVisible();
      await row.getByRole('button', { name: /Restore workspace recovery/ }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Restore workspace', exact: true })
        .click();
      await expect(history.getByRole('status')).toContainText('Files and conversation restored');
      await expect.poll(disk).toBe('Current work must survive');
      expect((await storedCrux(page, id)).messages).toEqual(unmarked.messages);
      await page.screenshot({ path: `e2e/.results/growth-${action.toLowerCase()}-recovery.png` });
      await launch.app.close();
      launch = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
      await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
      await launch.page.getByRole('button', { name: `Open Safe ${action}`, exact: true }).click();
      expect(disk()).toBe('Current work must survive');
      expect((await storedCrux(launch.page, id)).messages).toEqual(unmarked.messages);
      await expect(launch.page.getByText('Please write hello', { exact: true })).toHaveCount(1);
      expect(
        await launch.page.evaluate(
          (id) =>
            window.electronAPI!.sqlite.all(
              "SELECT id FROM dimensions WHERE source_id=? AND type='growth'",
              [id],
            ),
          id,
        ),
      ).toHaveLength(1);
    } finally {
      await launch.app.close();
    }
  });
}
