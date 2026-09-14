import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The book edition of a Notes Crux: Settings chooses "Web pages and an EPUB
 * book", the notebook bar's Save book (EPUB) builds the edition and keeps the
 * book as an output, the scripted collaborator does the same through
 * save_notebook_book, Share publishes the site with the book beside it and a
 * download link, and the outputs survive a restart and a clean-Garden import.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
const epubBytes = (folder: string, path: string) => readFileSync(join(folder, path));
const isEpub = (bytes: Buffer) =>
  bytes.subarray(0, 2).toString() === 'PK' &&
  bytes.subarray(30, 38).toString() === 'mimetype' &&
  bytes.subarray(38, 58).toString() === 'application/epub+zip';

test('Notes book: Settings → Save book (EPUB) → collaborator → Share → restart → clean import', async () => {
  test.setTimeout(20 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/notes-book');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'notebook.crux');
  let folder = '';
  let id = '';
  const publication = () => JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8'));
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        console.log(`[renderer ${message.type()}] ${message.text().slice(0, 600)}`);
    });
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);

    await test.step('a notebook with two public notes and a private one', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Notes/ }).click();
      await page.getByLabel('Name', { exact: true }).fill('Field notes');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await expect
        .poll(() => existsSync(join(folder, 'notebook/Welcome.md')), { timeout: 60000 })
        .toBe(true);
      mkdirSync(join(folder, 'notebook/.assets'), { recursive: true });
      writeFileSync(
        join(folder, 'notebook/Start.md'),
        '---\ninternal: PRIVATE_METADATA\n---\n# Start\nFIRST_CHAPTER_BODY\n[Next](Second.md)\n![Dot](.assets/dot.png)\n\n- [x] done\n',
      );
      writeFileSync(join(folder, 'notebook/Second.md'), '# Second\nSECOND_CHAPTER_BODY\n');
      writeFileSync(join(folder, 'notebook/Private.md'), 'PRIVATE_NOTE_BODY');
      writeFileSync(
        join(folder, 'notebook/.assets/dot.png'),
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      );
      await page.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
      const format = page.getByLabel('Book edition', { exact: true });
      await expect(format).toHaveValue('web');
      await format.selectOption('epub');
      await expect.poll(() => publication().format).toBe('epub');
      await page.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
      await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
      const box = (path: string) =>
        frameOf(page).locator(`#garden-publication input[data-note="${path}"]`);
      await expect(box('Start.md')).toBeVisible({ timeout: 60000 });
      await frameOf(page)
        .locator('#garden-publication input:not([type=checkbox])')
        .fill('Field Notes');
      await box('Start.md').check();
      await box('Second.md').check();
      await expect.poll(() => publication().pages).toEqual(['Start.md', 'Second.md']);
      await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
      await expect(status(page)).toHaveText('Saved');
    });

    await test.step('the bar saves the book as an output', async () => {
      expect(publication().format).toBe('epub');
      expect(publication().pages).toEqual(['Start.md', 'Second.md']);
      const alert = frameOf(page).locator('#garden-project [role=alert]');
      await frameOf(page).getByRole('button', { name: 'Save book (EPUB)' }).click();
      await expect(status(page)).toHaveText('Building the book…');
      // The first build installs the edition's renderer into the folder (minutes); the
      // bar's confirmation is brief, so the output on disk is the evidence.
      await expect
        .poll(
          async () => {
            if (await alert.isVisible()) throw new Error(`Bar alert: ${await alert.textContent()}`);
            return outputs(folder).length;
          },
          { timeout: 9 * 60_000 },
        )
        .toBe(1);
      const [book] = outputs(folder);
      expect(book!.mimeType).toBe('application/epub+zip');
      expect(book!.path).toMatch(/^exports\/.*\.epub$/);
      const bytes = epubBytes(folder, book!.path);
      expect(isEpub(bytes)).toBe(true);
      expect(bytes.includes('PRIVATE_NOTE_BODY')).toBe(false);
      expect(bytes.includes('PRIVATE_METADATA')).toBe(false);
      await page.screenshot({ path: join(evidence, 'notes-book-saved.png') });
    });

    await test.step('the scripted collaborator builds the book with save_notebook_book', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Make the book [notes:book]');
      await box.press('Enter');
      await expect(
        page.getByText('Built the book from the public notes and saved it in exports.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 6 * 60_000 });
      await expect.poll(() => outputs(folder).length).toBe(2);
      expect(outputs(folder).every((o) => o.mimeType === 'application/epub+zip')).toBe(true);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'notes-book-agent.png') });
    });

    await test.step('Share publishes the site with the book beside it', async () => {
      await page.getByRole('button', { name: 'Toggle share' }).click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({
        timeout: 6 * 60_000,
      });
      const files = api.state.published[id] ?? [];
      const book = files.find((f) => f.path === 'field-notes.epub');
      expect(book, files.map((f) => f.path).join(', ')).toBeTruthy();
      expect(isEpub(Buffer.from(book!.bytes))).toBe(true);
      const index = Buffer.from(files.find((f) => f.path === 'index.html')!.bytes).toString('utf8');
      expect(index).toContain('href="/field-notes.epub" download');
      expect(index).toContain('Download the book (EPUB)');
      expect(index).not.toContain('PRIVATE_NOTE_BODY');
      await page.screenshot({ path: join(evidence, 'notes-book-published.png') });
      await page.getByRole('button', { name: 'Toggle share' }).click();
    });
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the choice and both books are still there', async () => {
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await page.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
      await expect(page.getByLabel('Book edition', { exact: true })).toHaveValue('epub');
      await page.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
      expect(outputs(folder).length).toBe(2);
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports with its books', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder as string;
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      expect(publication().format).toBe('epub');
      const books = outputs(folder);
      expect(books.length).toBe(2);
      expect(isEpub(epubBytes(folder, books[0]!.path))).toBe(true);
      await page.screenshot({ path: join(evidence, 'notes-book-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
