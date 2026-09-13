import { test, expect } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';

/**
 * Documents in Tigrana (V1-GAPS-PLAN.md §2.1): a person imports a Word document
 * through the bar and it becomes a note with its list, table and image; the
 * note goes back out as a .docx output; the collaborator imports a document
 * a person dropped into the Crux and exports the open note; both survive a
 * restart. The complete-Crux archive path is covered by notes-crux.spec.ts.
 */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const fixture = resolve(__dirname, 'fixtures/documents/Letter.docx');
const documentXml = (path: string) => execFileSync('unzip', ['-p', path, 'word/document.xml']).toString('utf8');

test('Notes documents: DOCX in through the bar and the collaborator, notes out as DOCX outputs, restart', async () => {
  test.setTimeout(420000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const evidence = resolve(__dirname, '../../docs/notes');
  mkdirSync(evidence, { recursive: true });
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const status = () => frame().locator('#garden-project [role=status]');
  let folder = '';
  const note = (path: string) => join(folder, 'notebook', path);
  const openNote = async (section: string, title: string) => {
    await frame().locator(`.folder-row[data-folder-path="${section}"]`).click();
    // The folder and its note can share a name; pick the note row.
    await frame()
      .locator('.unified-tree-pane .unified-note-row')
      .filter({ has: frame().getByText(title, { exact: true }) })
      .first()
      .click();
    await expect(frame().locator('.tiptap').first()).toBeVisible();
  };
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Letters');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder as string;
    await expect(status()).toHaveText('Saved', { timeout: 120000 });

    await test.step('a person imports a Word document; it is a note with its list, table and image', async () => {
      const chooser = page.waitForEvent('filechooser');
      await frame().getByRole('button', { name: 'Import document…', exact: true }).click();
      await (await chooser).setFiles(fixture);
      await expect.poll(() => existsSync(note('Imported/Letter/Letter.md')), { timeout: 60000 }).toBe(true);
      await expect.poll(() => existsSync(note('Imported/Letter/.assets/Letter 1.png'))).toBe(true);
      const markdown = readFileSync(note('Imported/Letter/Letter.md'), 'utf8');
      expect(markdown).toContain('# Letter to the seed library');
      expect(markdown).toContain('**thank you**');
      expect(markdown).toContain('[catalogue](https://example.org/catalogue)');
      expect(markdown).toMatch(/^- Peas$/m);
      expect(markdown).toContain('| Seed | Packets |');
      expect(markdown).toContain('![Seal](.assets/Letter 1.png)');
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await openNote('Imported', 'Letter');
      const editor = frame().locator('.tiptap').first();
      await expect(editor).toContainText('LETTER_BODY_SENTINEL');
      await expect(editor.locator('table')).toHaveCount(1);
      await expect
        .poll(() => editor.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
      await page.screenshot({ path: join(evidence, 'notes-document-imported.png') });
    });

    await test.step('the note goes back out as a Word document output', async () => {
      await frame().getByRole('button', { name: 'Export note as DOCX', exact: true }).click();
      await expect(status()).toContainText('Exported Letter as a Word document', { timeout: 60000 });
      await expect.poll(() => outputs(folder).map((o) => o.label)).toEqual(['Letter (DOCX)']);
      const output = outputs(folder)[0]!;
      expect(output.mimeType).toBe(DOCX_MIME);
      const xml = documentXml(join(folder, output.path));
      expect(xml).toContain('LETTER_BODY_SENTINEL');
      expect(xml).toContain('<w:tbl>');
      expect(xml).toContain('<pic:pic');
      expect(xml).toContain('Letter to the seed library');
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
    });

    await test.step('the collaborator imports a document a person dropped into the Crux, and exports the open note', async () => {
      mkdirSync(join(folder, 'inbox'), { recursive: true });
      copyFileSync(fixture, join(folder, 'inbox', 'Letter.docx'));
      await collaborator(page, 'Bring the letter in [notes:import]', 'Imported the letter into the notebook.');
      await expect.poll(() => existsSync(note('Imported/Letter 2/Letter.md')), { timeout: 60000 }).toBe(true);
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await openNote('Imported', 'Letter');
      await collaborator(page, 'Hand me this note as a Word file [notes:document]', 'Exported the open note as a Word document in exports.');
      await expect.poll(() => outputs(folder).length, { timeout: 60000 }).toBe(2);
      await page.screenshot({ path: join(evidence, 'notes-document-exported.png') });
    });

    await test.step('restart: the imported notes and the outputs are still there', async () => {
      await instance.app.close();
      instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
      page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 2000, height: 1200 });
      await page.getByRole('button', { name: /enter/i }).click();
      // The last Crux reopens on its own.
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await openNote('Imported', 'Letter');
      await expect(frame().locator('.tiptap').first()).toContainText('LETTER_BODY_SENTINEL');
      expect(outputs(folder).length).toBe(2);
    });
  } finally {
    await instance.app.close();
  }
});
