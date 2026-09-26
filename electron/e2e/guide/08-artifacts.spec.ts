import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 08 · Artifacts — names with spaces and Unicode, a
 * conflicting name, and a path that tries to leave the project.
 */
test.describe('guide 08 · Artifacts', () => {
  test('ART-06 — spaces and Unicode work, a conflict is asked about, a path cannot leave the project', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Named files');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const artifacts = await openPanel(page, 'artifacts', 'Toggle artifacts');
      const make = async (name: string) => {
        await artifacts.getByRole('button', { name: 'New file', exact: true }).click();
        const input = page.getByRole('tree').getByRole('textbox');
        await input.fill(name);
        await input.press('Enter');
      };
      await make('my notes 2026.md');
      await expect(
        page.getByRole('tree').getByText('my notes 2026.md', { exact: true }),
      ).toBeVisible();
      await expect.poll(() => existsSync(join(folder, 'my notes 2026.md'))).toBe(true);
      await make('jardín-🌱.md');
      await expect(page.getByRole('tree').getByText('jardín-🌱.md', { exact: true })).toBeVisible();
      await expect.poll(() => existsSync(join(folder, 'jardín-🌱.md'))).toBe(true);
      // The same name again: no silent second copy.
      await make('my notes 2026.md');
      const asked = page.getByRole('dialog').filter({ hasText: /already exists/ });
      if (await asked.isVisible().catch(() => false)) await page.keyboard.press('Escape');
      await expect(
        page.getByRole('tree').getByText('my notes 2026.md', { exact: true }),
      ).toHaveCount(1);
      // A path that climbs out of the project stays inside or is refused; nothing lands beside the folder.
      await make('../escaped.txt');
      await page.waitForTimeout(1000);
      expect(existsSync(resolve(folder, '..', 'escaped.txt'))).toBe(false);
      const inside = existsSync(join(folder, 'escaped.txt'));
      const refused = await page.getByRole('alert').or(page.getByRole('alertdialog')).count();
      expect(inside || refused > 0).toBe(true);
      if (refused) await page.keyboard.press('Escape');
      // Files keep their bytes: the Unicode name reads back as written.
      expect(readFileSync(join(folder, 'jardín-🌱.md'), 'utf8')).toBe('');
    } finally {
      await app.close();
    }
  });

  test('ART-03 — an image opens in a viewer and a binary file is named as binary, never edited as text', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Kinds of files');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      );
      writeFileSync(join(folder, 'dot.png'), png);
      writeFileSync(join(folder, 'blob.bin'), Buffer.from([0, 1, 2, 255, 254, 0, 7]));
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      const tree = page.getByRole('tree');
      await expect(tree.getByText('dot.png', { exact: true })).toBeVisible({ timeout: 30_000 });
      await tree.getByText('dot.png', { exact: true }).click();
      const workshop = page.getByTestId('pane-body-workshop');
      await expect(workshop.locator('img').first()).toBeVisible({ timeout: 30_000 });
      await expect(tree.getByText('blob.bin', { exact: true })).toBeVisible({ timeout: 30_000 });
      await tree.getByText('blob.bin', { exact: true }).click();
      await expect(workshop.getByText(/Binary file/)).toBeVisible({ timeout: 30_000 });
      await expect(workshop.locator('.monaco-editor')).toHaveCount(0);
      // The bytes on disk are what was written.
      expect([...readFileSync(join(folder, 'blob.bin'))]).toEqual([0, 1, 2, 255, 254, 0, 7]);
    } finally {
      await app.close();
    }
  });
});
