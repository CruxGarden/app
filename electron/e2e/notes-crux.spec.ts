import { test, expect, type Page } from '@playwright/test';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { openWindow, serve } from './public-site-helpers';

/**
 * The actual Tigrana (upstream's app in its browser mode, with the Garden's
 * NotebookStorage): a note created and written with the real editor autosaves
 * to notebook/, the host's flush follows a view switch, the public edition
 * choices are kept, the notebook survives a restart, a stale external write is
 * refused with the draft kept, the published edition keeps only the chosen
 * notes, and a complete Crux archive imports into a clean Garden.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
const editor = (page: Page) => frameOf(page).locator('.tiptap').first();
async function createNote(page: Page, title: string) {
  // Tigrana adds the note as Untitled; opening it and naming it in the title field renames the file.
  await frameOf(page).getByRole('button', { name: 'Add Note or Folder', exact: true }).click();
  await frameOf(page).getByRole('menuitem', { name: /New Note/ }).click();
  await frameOf(page).getByRole('button', { name: 'Untitled', exact: true }).first().click();
  const field = frameOf(page).getByLabel('Note title', { exact: true });
  await expect(field).toHaveValue('Untitled');
  await field.fill(title);
  await field.press('Enter');
  await expect(frameOf(page).getByRole('button', { name: title, exact: true }).first()).toBeVisible();
  await expect(editor(page)).toBeVisible();
}

test('Notes Crux: the actual Tigrana — write, flush, public choices, restart, conflict, edition, clean import', async () => {
  test.setTimeout(12 * 60_000);
  let instance = await launchApp();
  const dir = instance.dir;
  const evidence = resolve(__dirname, '../../docs/notes');
  mkdirSync(evidence, { recursive: true });
  const archive = join(dir, 'field-notes.crux');
  let folder = '';
  const note = (path: string) => join(folder, 'notebook', path);
  const publication = () => JSON.parse(readFileSync(note('publish.json'), 'utf8'));
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);

    await test.step('create; Tigrana opens the notebook and writes its own welcome note and metadata', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Notes/ }).click();
      await page.getByLabel('Name', { exact: true }).fill('Field notes');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      console.log('Notes folder', folder);
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await expect.poll(() => existsSync(note('Welcome.md')), { timeout: 60000 }).toBe(true);
      await expect.poll(() => existsSync(note('.tigrana/metadata.json'))).toBe(true);
      expect(existsSync(join(folder, 'runtime/index.html'))).toBe(true);
      await page.screenshot({ path: join(evidence, 'notes-initial.png') });
    });

    await test.step('a person creates a note and writes in the real editor; autosave reaches the file', async () => {
      await createNote(page, 'Field journal');
      await editor(page).click();
      await page.keyboard.type('A quiet place at the edge of the field.');
      await expect
        .poll(
          () =>
            existsSync(note('Field journal.md'))
              ? readFileSync(note('Field journal.md'), 'utf8')
              : '',
          { timeout: 30000 },
        )
        .toContain('quiet place');
      await expect(status(page)).toHaveText('Saved');
      await page.screenshot({ path: join(evidence, 'notes-writing.png') });
    });

    await test.step('switching the Workshop view flushes the last keystrokes', async () => {
      await page.keyboard.type(' The wind carries seeds.');
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Advanced', exact: true })
        .click();
      await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'advanced');
      expect(readFileSync(note('Field journal.md'), 'utf8')).toContain('carries seeds');
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Use app', exact: true })
        .click();
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
    });

    await test.step('a private note, and the public edition choices kept in publish.json', async () => {
      await createNote(page, 'Private thoughts');
      await editor(page).click();
      await page.keyboard.type('PRIVATE_NOTE_SENTINEL_9e2a');
      await expect
        .poll(
          () =>
            existsSync(note('Private thoughts.md'))
              ? readFileSync(note('Private thoughts.md'), 'utf8')
              : '',
          { timeout: 30000 },
        )
        .toContain('PRIVATE_NOTE_SENTINEL');
      await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
      await frameOf(page)
        .locator('#garden-publication input[data-note="Field journal.md"]')
        .check();
      await expect.poll(() => publication().pages).toEqual(['Field journal.md']);
      await expect(
        frameOf(page).locator('#garden-publication input[data-note="Private thoughts.md"]'),
      ).not.toBeChecked();
      await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
      await expect(status(page)).toHaveText('Saved');
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const growth = (await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            "SELECT COUNT(*) AS count FROM dimensions WHERE source_id = ? AND type = 'growth'",
            [id],
          ),
        id,
      )) as { count: number };
      expect(growth.count).toBeGreaterThan(3);
    });

    const stopped = instance.app.waitForEvent('close');
    await instance.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.isVisible())!
        .close(),
    );
    await stopped;
    instance = await launchApp({ dir });
    page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });

    await test.step('restart: the notes reopen; a stale external write is refused and the draft kept', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await frameOf(page)
        .getByRole('button', { name: /Field journal/ })
        .first()
        .click();
      await expect(editor(page)).toContainText('quiet place');
      writeFileSync(note('Field journal.md'), 'Changed from another editor.\n');
      await editor(page).click();
      await page.keyboard.press('End');
      await page.keyboard.type(' More.');
      await expect(frameOf(page).locator('#garden-project [role=alert]')).toContainText(
        'changed elsewhere',
        { timeout: 30000 },
      );
      expect(readFileSync(note('Field journal.md'), 'utf8')).toContain('another editor');
      page.once('dialog', (d) => d.accept());
      await frameOf(page)
        .getByRole('button', { name: 'Discard draft and reload', exact: true })
        .click();
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await frameOf(page)
        .getByRole('button', { name: /Field journal/ })
        .first()
        .click();
      await expect(editor(page)).toContainText('another editor');
      await page.screenshot({ path: join(evidence, 'notes-reopened.png') });
    });

    await test.step('the published edition keeps only the chosen note', async () => {
      const installed = await page.evaluate(
        async (folder) => window.electronAPI!.toolchain.install(folder),
        folder,
      );
      expect(installed.code, installed.log).toBe(0);
      const built = await page.evaluate(
        async (folder) => window.electronAPI!.toolchain.build(folder),
        folder,
      );
      expect(built.code, built.log).toBe(0);
      const dist = join(folder, 'dist');
      const allText = (path: string): string =>
        readdirSync(path, { withFileTypes: true })
          .map((f) =>
            f.isDirectory()
              ? allText(join(path, f.name))
              : readFileSync(join(path, f.name), 'utf8'),
          )
          .join('\n');
      expect(allText(dist)).not.toContain('PRIVATE_NOTE_SENTINEL');
      const server = await serve(dist);
      try {
        const site = await openWindow(instance.app, server.origin + '/');
        await expect(site.getByRole('heading', { name: 'My notebook' })).toBeVisible();
        await expect(site.locator('article')).toContainText('another editor');
        await expect(site.getByLabel('App appearance', { exact: true })).toHaveCount(0);
        await expect(site.getByText('Private thoughts', { exact: true })).toHaveCount(0);
        await site.screenshot({ path: join(evidence, 'notes-public-edition.png') });
        await site.close();
      } finally {
        await server.close();
      }
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await exportNativeCrux(page, archive, instance.app);
    });
  } finally {
    await instance.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const restored = await launchApp();
  try {
    const { page } = restored;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await test.step('clean Garden: the complete Crux imports and the notes open in Tigrana', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await frameOf(page)
        .getByRole('button', { name: /Field journal/ })
        .first()
        .click();
      await expect(editor(page)).toContainText('another editor');
      expect(publication().pages).toEqual(['Field journal.md']);
      await page.screenshot({ path: join(evidence, 'notes-imported.png') });
    });
  } finally {
    await restored.app.close();
  }
});
