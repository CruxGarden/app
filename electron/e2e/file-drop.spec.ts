import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
async function home(page: import('@playwright/test').Page) {
  if (/\/c\//.test(page.url())) {
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'Close crux', exact: true })
      .click();
  }
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
}

/**
 * File-drop routing (V1-GAPS-PLAN.md §2.3): a file chosen in Add Crux or
 * dropped on Home becomes a Crux in the tool that opens it, with the file
 * inside; Tigrana brings a Word document in by itself; a file no tool takes
 * says so.
 */
const fixtures = resolve(__dirname, 'fixtures');
const currentId = (page: import('@playwright/test').Page) =>
  page.locator('[data-workspace-id]').getAttribute('data-workspace-id');

test('Start from files: documents, available image tools, explicit refusal and a dropped spreadsheet', async () => {
  test.setTimeout(300000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '.results/file-drop');
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
        .poll(() => existsSync(join(folder, 'notebook/Imported/Letter/Letter.md')), {
          timeout: 120000,
        })
        .toBe(true);
      expect(readFileSync(join(folder, 'notebook/Imported/Letter/Letter.md'), 'utf8')).toContain(
        'LETTER_BODY_SENTINEL',
      );
      await page.screenshot({ path: join(evidence, 'file-drop-docx.png') });
    });

    await test.step('a Markdown file: a note in a Notes Crux', async () => {
      await home(page);
      const { folder } = await startFrom(join(fixtures, 'documents/field-notes.md'));
      await expect
        .poll(() => existsSync(join(folder, 'notebook/Imported/field-notes/field-notes.md')))
        .toBe(true);
      expect(
        readFileSync(join(folder, 'notebook/Imported/field-notes/field-notes.md'), 'utf8'),
      ).toContain('FIELD_NOTES_SENTINEL');
      await expect(
        page.frameLocator('iframe[data-crux-id]').locator('#garden-project [role=status]'),
      ).toHaveText('Saved', { timeout: 120000 });
    });

    await test.step('an image uses its installed tool or refuses without creating an empty Crux', async () => {
      await home(page);
      await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
      const availableTools = page.getByRole('checkbox', { name: /Include tools to install/ });
      if (await availableTools.isVisible()) await availableTools.check();
      await page.getByRole('textbox', { name: 'Find a starting point' }).fill('miniPaint');
      const imageTool = page.locator('[data-template-id="minipaint-app"]');
      const installed = !(await imageTool.innerText()).includes('not installed');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Start from a file…', exact: true }).click();
      await (await chooser).setFiles(join(fixtures, 'documents/seal.png'));
      if (!installed) {
        await expect(page.getByRole('alert')).toContainText('No Crux Tool opens seal.png');
        expect(
          await page.evaluate(() =>
            window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'seal'"),
          ),
        ).toEqual([]);
        await page
          .getByRole('dialog', { name: 'Add Crux' })
          .getByRole('button', { name: 'Close', exact: true })
          .click();
        return;
      }
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const folder = (await storedCrux(page, (await currentId(page))!)).projectFolder;
      expect(existsSync(join(folder, 'images/seal.png'))).toBe(true);
      await expect(page.getByText(/Started from seal\.png/)).toBeVisible();
      await expect(page.getByText(/Open it from miniPaint/)).toBeVisible();
      await expect(
        page.frameLocator('iframe[data-crux-id]').locator('#garden-project [role=status]'),
      ).toContainText(/Saved|Opening/, { timeout: 120000 });
      await page.screenshot({ path: join(evidence, 'file-drop-image.png') });
    });

    await test.step('a CSV dropped on Home: a spreadsheet Crux; a file no tool takes is refused', async () => {
      await home(page);
      const drop = async (name: string, content: string) => {
        await page.getByTestId('home-drop').evaluate(
          (el, { name, content }) => {
            const dt = new DataTransfer();
            dt.items.add(new File([content], name, { type: 'text/plain' }));
            el.dispatchEvent(
              new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
            );
          },
          { name, content },
        );
      };
      await drop('setup.exe', 'MZ');
      await expect(
        page.getByRole('status').filter({ hasText: 'No Crux Tool opens setup.exe' }),
      ).toBeVisible();
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

test('Start from files refuses colliding note paths, then preserves a corrected import across restart', async () => {
  test.setTimeout(180_000);
  let instance = await launchApp();
  const { dir } = instance;
  const source = join(dir, 'source-documents');
  mkdirSync(source);
  writeFileSync(join(source, 'note.md'), 'MARKDOWN_SOURCE_MUST_SURVIVE');
  writeFileSync(join(source, 'note.txt'), 'TEXT_SOURCE_MUST_SURVIVE');
  writeFileSync(join(source, 'second.txt'), 'TEXT_SOURCE_MUST_SURVIVE');
  const inventory = (page: import('@playwright/test').Page) =>
    page.evaluate(() =>
      window.electronAPI!.sqlite.all('SELECT id FROM cruxes WHERE deleted IS NULL ORDER BY id'),
    );
  try {
    const { page } = instance;
    await enterGarden(page);
    const before = await inventory(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Crux', exact: true });
    const choose = async (names: string[]) => {
      const chooser = page.waitForEvent('filechooser');
      await dialog.getByRole('button', { name: 'Start from a file…', exact: true }).click();
      await (await chooser).setFiles(names.map((name) => join(source, name)));
    };
    await choose(['note.md', 'note.txt']);
    await expect(dialog.getByRole('alert')).toContainText(/conflict|same destination/i);
    expect(await inventory(page)).toEqual(before);
    expect(readFileSync(join(source, 'note.md'), 'utf8')).toBe('MARKDOWN_SOURCE_MUST_SURVIVE');
    expect(readFileSync(join(source, 'note.txt'), 'utf8')).toBe('TEXT_SOURCE_MUST_SURVIVE');

    // The refusal leaves the real dialog usable. The person can correct the
    // colliding name and repeat the same action without losing either body.
    await choose(['note.md', 'second.txt']);
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
    const id = (await currentId(page))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const imported = [
      ['notebook/Imported/note/note.md', 'MARKDOWN_SOURCE_MUST_SURVIVE'],
      ['notebook/Imported/note/second.md', 'TEXT_SOURCE_MUST_SURVIVE'],
    ] as const;
    for (const [path, content] of imported)
      expect(readFileSync(join(folder, path), 'utf8')).toBe(content);
    expect((await inventory(page)).length).toBe(before.length + 1);

    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.getByRole('button', { name: 'Open note and 1 more', exact: true }).click();
    await expect(instance.page.locator(`[data-workspace-id="${id}"]`)).toBeVisible();
    for (const [path, content] of imported) {
      expect(readFileSync(join(folder, path), 'utf8')).toBe(content);
      const saved = await instance.page.evaluate(
        async ({ id, path }) => {
          const files = window.electronAPI!.sqlite.fileContent!;
          const head = (await files.head(id))!;
          const file = await files.read({ cruxId: id, expected: head, path });
          return file ? new TextDecoder().decode(new Uint8Array(file.bytes)) : null;
        },
        { id, path },
      );
      expect(saved).toBe(content);
    }
    expect(readFileSync(join(source, 'note.md'), 'utf8')).toBe('MARKDOWN_SOURCE_MUST_SURVIVE');
    expect(readFileSync(join(source, 'note.txt'), 'utf8')).toBe('TEXT_SOURCE_MUST_SURVIVE');
  } finally {
    await instance.app.close().catch(() => {});
  }
});
