import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { home } from './game-cruxspace-helpers';

/**
 * File-drop routing (V1-GAPS-PLAN.md §2.3): a file chosen in Add Crux or
 * dropped on Home becomes a Crux in the tool that opens it, with the file
 * inside; Tigrana brings a Word document in by itself; a file no tool takes
 * says so.
 */
const fixtures = resolve(__dirname, 'fixtures');
const currentId = (page: import('@playwright/test').Page) =>
  page.locator('[data-workspace-id]').getAttribute('data-workspace-id');

test('Start from a file: a document becomes a notebook, an image a miniPaint Crux, a dropped CSV a spreadsheet', async () => {
  test.setTimeout(300000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/file-drop');
  try {
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(page);
    const startFrom = async (file: string) => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Start from a file…', exact: true }).click();
      await (await chooser).setFiles(file);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await currentId(page))!;
      return { id, folder: (await storedCrux(page, id)).projectFolder as string };
    };

    await test.step('a Word document: a Notes Crux that imports it', async () => {
      const { folder } = await startFrom(join(fixtures, 'documents/Letter.docx'));
      await expect(page.getByText('Letter', { exact: true }).first()).toBeVisible();
      expect(existsSync(join(folder, 'inbox/Letter.docx'))).toBe(true);
      await expect(page.getByText(/Started from Letter\.docx/)).toBeVisible();
      await expect
        .poll(() => existsSync(join(folder, 'notebook/Imported/Letter/Letter.md')), { timeout: 120000 })
        .toBe(true);
      expect(readFileSync(join(folder, 'notebook/Imported/Letter/Letter.md'), 'utf8')).toContain('LETTER_BODY_SENTINEL');
      await page.screenshot({ path: join(evidence, 'file-drop-docx.png') });
    });

    await test.step('a Markdown file: a note in a Notes Crux', async () => {
      await home(page);
      const { folder } = await startFrom(join(fixtures, 'documents/field-notes.md'));
      await expect.poll(() => existsSync(join(folder, 'notebook/Imported/field-notes/field-notes.md'))).toBe(true);
      expect(readFileSync(join(folder, 'notebook/Imported/field-notes/field-notes.md'), 'utf8')).toContain('FIELD_NOTES_SENTINEL');
      await expect(page.frameLocator('iframe[data-crux-id]').locator('#garden-project [role=status]')).toHaveText('Saved', { timeout: 120000 });
    });

    await test.step('an image: a miniPaint Crux with the image in it', async () => {
      await home(page);
      const { folder } = await startFrom(join(fixtures, 'documents/seal.png'));
      expect(existsSync(join(folder, 'images/seal.png'))).toBe(true);
      await expect(page.getByText(/Started from seal\.png/)).toBeVisible();
      await expect(page.getByText(/Open it from miniPaint/)).toBeVisible();
      await expect(page.frameLocator('iframe[data-crux-id]').locator('#garden-project [role=status]')).toContainText(/Saved|Opening/, { timeout: 120000 });
      await page.screenshot({ path: join(evidence, 'file-drop-image.png') });
    });

    await test.step('a CSV dropped on Home: a spreadsheet Crux; a file no tool takes is refused', async () => {
      await home(page);
      const drop = async (name: string, content: string) => {
        await page.getByTestId('home-drop').evaluate(
          (el, { name, content }) => {
            const dt = new DataTransfer();
            dt.items.add(new File([content], name, { type: 'text/plain' }));
            el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
          },
          { name, content },
        );
      };
      await drop('setup.exe', 'MZ');
      await expect(page.getByRole('status').filter({ hasText: 'No Crux Tool opens setup.exe' })).toBeVisible();
      await drop('seedlings.csv', readFileSync(join(fixtures, 'seed-trial/seedlings.csv'), 'utf8'));
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await currentId(page))!;
      const folder = (await storedCrux(page, id)).projectFolder as string;
      expect(readFileSync(join(folder, 'inbox/seedlings.csv'), 'utf8')).toContain('Hours of light');
      await expect(page.getByText(/Open it from Univer Sheets/)).toBeVisible();
      await page.screenshot({ path: join(evidence, 'file-drop-csv.png') });
    });
  } finally {
    await app.close();
  }
});
