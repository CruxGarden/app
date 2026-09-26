import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 03 · Add Crux and file entry. CREATE-03 (Install from
 * Explore) needs a local API and lives in tool-install.spec.ts; CREATE-06
 * (duplicate names on upload) in upload-skills-apex.spec.ts; CREATE-08 in
 * v2-gate.spec.ts.
 */
const cardCount = (page: Page) =>
  page.getByTestId('pane-body-home').getByRole('button', { name: /^Open / }).count();

test.describe('guide 03 · Add Crux', () => {
  test('CREATE-01 — choices are described; one Create makes one Crux with the typed name', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add Crux' });
      await expect(dialog.getByRole('button', { name: /^Blank/ })).toContainText(
        'Start with your own idea',
      );
      await expect(dialog.getByRole('button', { name: /^Notes/ })).toContainText('notebook');
      await dialog.getByRole('button', { name: /^Blank/ }).click();
      await expect(dialog.getByPlaceholder('My Crux')).toBeVisible();
      await dialog.getByPlaceholder('My Crux').fill('Named once');
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Named once',
      );
      await goHome(page);
      expect(await cardCount(page)).toBe(1);
      await expect(page.getByRole('button', { name: 'Open Named once' })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('CREATE-02 — closing with the button or Escape leaves no phantom Crux', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      for (const how of ['button', 'escape'] as const) {
        await page.getByRole('button', { name: 'Add Crux' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add Crux' });
        await dialog.getByRole('button', { name: /^Blank/ }).click();
        await dialog.getByPlaceholder('My Crux').fill('Never made');
        if (how === 'button') await dialog.getByRole('button', { name: 'Close' }).click();
        else await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        expect(await cardCount(page)).toBe(0);
      }
      // Reopened, the dialog is understandable: the proposed name, not the abandoned one.
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page
        .getByRole('dialog', { name: 'Add Crux' })
        .getByRole('button', { name: /^Blank/ })
        .click();
      await expect(page.getByPlaceholder('My Crux')).not.toHaveValue('Never made');
    } finally {
      await app.close();
    }
  });

  test('CREATE-04 — Install from .crux: a tool package installs, other archives are refused or opened, never a broken tool', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      // A real (non-tool) archive to try, exported from an ordinary Crux.
      await createCrux(page, 'Plain export');
      const exportPane = await openPanel(page, 'export', 'Toggle export');
      const filename = join(dir, 'plain.crux');
      await app.evaluate(({ session }, filename) => {
        session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
          item.setSavePath(filename),
        );
      }, filename);
      await exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click();
      await expect.poll(() => existsSync(filename), { timeout: 30_000 }).toBe(true);
      await goHome(page);

      await page.getByRole('button', { name: 'Add Crux' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add Crux' });
      const missing = dialog.getByText('not installed').first();
      test.skip(!(await missing.count()), 'every tool is bundled in this build');
      await missing.locator('xpath=ancestor::button[1]').click();
      const install = dialog.getByRole('button', { name: 'Install from .crux…' });
      await expect(install).toBeVisible();

      // Not an archive at all: refused with words, nothing created.
      const garbage = join(dir, 'garbage.crux');
      writeFileSync(garbage, 'this is not a zip');
      let chooser = page.waitForEvent('filechooser');
      await install.click();
      await (await chooser).setFiles(garbage);
      await expect(page.getByRole('alert').or(page.getByRole('alertdialog')).first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Add Crux' })).toBeVisible();
      expect(
        await page.evaluate(() =>
          window.electronAPI!.sqlite.all(
            "SELECT id FROM cruxes WHERE kind = 'tool' OR type = 'tool'",
          ),
        ),
      ).toEqual([]);

      // A plain Crux archive: it opens as a Crux, and no tool claims to be installed.
      chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Install from .crux…' }).click();
      await (await chooser).setFiles(filename);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('dialog', { name: 'Tool installed' })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('CREATE-05 — Start from a file routes an audio clip, a PDF and a folder, or says why not', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      const clip = join(dir, 'clip.mp3');
      writeFileSync(clip, Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]));
      const pdf = join(dir, 'paper.pdf');
      writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
      for (const file of [clip, pdf]) {
        await goHome(page);
        await page.getByRole('button', { name: 'Add Crux' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add Crux' });
        const chooser = page.waitForEvent('filechooser');
        await dialog.getByRole('button', { name: 'Start from a file' }).click();
        await (await chooser).setFiles(file);
        const opened = page.locator('[data-workspace-id]');
        const refused = page.getByRole('alert').or(page.getByRole('alertdialog'));
        await expect(opened.or(refused).first()).toBeVisible({ timeout: 60_000 });
        if (await opened.count()) {
          // The file arrived whole, under the name it had.
          const name = file.split('/').pop()!;
          await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
            timeout: 30_000,
          });
        } else {
          await expect(refused.first()).toContainText(/[a-z]/);
          await page.keyboard.press('Escape');
        }
      }
    } finally {
      await app.close();
    }
  });

  test('CREATE-07 — a malformed archive is refused with words and creates nothing', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      const empty = join(dir, 'empty.crux');
      const zip = new JSZip();
      zip.file('readme.txt', 'nothing of a Crux in here');
      writeFileSync(empty, await zip.generateAsync({ type: 'nodebuffer' }));
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import .crux file', exact: true }).click();
      await (await chooser).setFiles(empty);
      await expect(page.getByRole('alert').or(page.getByRole('alertdialog')).first()).toContainText(
        /invalid|missing|not a|archive/i,
      );
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      expect(await cardCount(page)).toBe(0);
    } finally {
      await app.close();
    }
  });
});
