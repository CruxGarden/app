import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import JSZip from 'jszip';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome, storedCrux } from '../multi-crux-helpers';
import { openPanel, newTaskButton } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/** Send the next download to `filename` and wait for it to exist. */
async function captureDownload(
  app: ElectronApplication,
  filename: string,
  click: () => Promise<void>,
) {
  await app.evaluate(({ session }, filename) => {
    session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
      item.setSavePath(filename),
    );
  }, filename);
  await click();
  await expect.poll(() => existsSync(filename), { timeout: 60_000 }).toBe(true);
}

/** Add Crux → Import Crux, tool or Mood → the imported workspace's id. */
async function importCruxFile(page: Page, filename: string) {
  await goHome(page);
  await page.getByRole('button', { name: 'Add Crux' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Crux, tool or Mood', exact: true }).click();
  await (await chooser).setFiles(filename);
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90_000 });
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}

/**
 * V1-TESTING-GUIDE § 15 · Export — a truncated archive is refused and the
 * garden is untouched. The formats and copies are private-archive-ui and
 * export specs.
 */
test.describe('guide 15 · Export', () => {
  test('EXPORT-04 — importing a Crux that is already here makes a copy with its own identity and its own Task graph; the original is untouched', async () => {
    test.setTimeout(240_000);
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      const originalId = await createCrux(page, 'Original');
      const originalFolder = (await storedCrux(page, originalId)).projectFolder as string;
      await writeFirstFile(page, 'index.html', '<h1>Main</h1>');
      // A Task with its own edit: the graph the copy must not share.
      await (await newTaskButton(page)).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Alternative');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      const originalTaskId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      expect(originalTaskId).not.toBe(originalId);
      // The Task workspace has its own layout: open the file from its Artifacts.
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('index.html', { exact: true }).click();
      const taskEditor = page.locator('.monaco-editor').first();
      await expect(taskEditor).toBeVisible({ timeout: 30_000 });
      await taskEditor.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('<h1>Task</h1>');
      await page.keyboard.press('ControlOrMeta+s');
      await expect(taskEditor).toContainText('Task');
      await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        originalId,
      );
      const exportPane = await openPanel(page, 'export', 'Toggle export');
      const filename = join(dir, 'original.crux');
      await captureDownload(app, filename, () =>
        exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click(),
      );

      // Import it into the same garden: the app offers a copy (there is no replace).
      const copyId = await importCruxFile(page, filename);
      expect(copyId).not.toBe(originalId);
      const copyFolder = (await storedCrux(page, copyId)).projectFolder as string;
      expect(copyFolder).not.toBe(originalFolder);
      expect(readFileSync(join(copyFolder, 'index.html'), 'utf8')).toBe('<h1>Main</h1>');
      // The copy's Task is a different Task with a different folder holding the Task's edit.
      await expect(
        page.getByTestId('task-bar').getByRole('link', { name: /^Alternative/ }),
      ).toBeVisible({ timeout: 30_000 });
      await page
        .getByTestId('task-bar')
        .getByRole('link', { name: /^Alternative/ })
        .click();
      await expect(page.locator('[data-workspace-id]')).not.toHaveAttribute(
        'data-workspace-id',
        copyId,
        { timeout: 30_000 },
      );
      const copyTaskId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      expect(copyTaskId).not.toBe(originalTaskId);
      expect(copyTaskId).not.toBe(copyId);
      const folders = await page.evaluate(
        async ({ originalTaskId, copyTaskId }) => {
          const get = async (id: string) =>
            (
              (await window.electronAPI!.sqlite.get(
                'SELECT project_folder FROM working_copies WHERE id = ?',
                [id],
              )) as { project_folder: string }
            ).project_folder;
          return { original: await get(originalTaskId), copy: await get(copyTaskId) };
        },
        { originalTaskId, copyTaskId },
      );
      expect(folders.copy).not.toBe(folders.original);
      // (Monaco may auto-close the tag: compare what was typed, not the trailing bracket.)
      expect(readFileSync(join(folders.copy, 'index.html'), 'utf8')).toContain('<h1>Task</h1>');
      expect(readFileSync(join(folders.original, 'index.html'), 'utf8')).toContain('<h1>Task</h1>');
      // Both Cruxes are on Home, and the original still reads as it did.
      await goHome(page);
      await expect(
        page.getByTestId('pane-body-home').getByRole('button', { name: /^Open Original/ }),
      ).toHaveCount(2);
      expect(readFileSync(join(originalFolder, 'index.html'), 'utf8')).toBe('<h1>Main</h1>');
    } finally {
      await app.close();
    }
  });

  test('EXPORT-06 — the pane says which export keeps history; the .crux carries the graph, Export Artifacts is only the files', async () => {
    test.setTimeout(150_000);
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Two formats');
      await writeFirstFile(page, 'index.html', '<h1>Formats</h1>');
      const exportPane = await openPanel(page, 'export', 'Toggle export');
      // The wording: the archive carries everything, the zip is the files alone.
      await expect(exportPane).toContainText(
        'The .crux archive carries the files, the conversation and every snapshot; Export Artifacts is a plain zip of the files.',
      );
      await expect(exportPane).toContainText(/This private backup is self-contained/);
      await expect(exportPane.getByText('history', { exact: true })).toBeVisible();
      const archive = join(dir, 'two-formats.crux');
      await captureDownload(app, archive, () =>
        exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click(),
      );
      const zipFile = join(dir, 'two-formats.zip');
      await captureDownload(app, zipFile, () =>
        exportPane.getByRole('button', { name: 'Export Artifacts', exact: true }).click(),
      );
      const crux = await JSZip.loadAsync(readFileSync(archive));
      const manifest = JSON.parse(await crux.file('manifest.json')!.async('text'));
      expect(manifest).toMatchObject({ purpose: 'private-backup' });
      expect(crux.file('graph.json')).not.toBeNull();
      expect(Object.keys(crux.files).some((f) => f.startsWith('content/'))).toBe(true);
      // The plain zip: the file, and none of the archive's history or manifest.
      const zip = await JSZip.loadAsync(readFileSync(zipFile));
      expect(await zip.file('index.html')!.async('text')).toBe('<h1>Formats</h1>');
      expect(zip.file('manifest.json')).toBeNull();
      expect(zip.file('graph.json')).toBeNull();
      expect(Object.keys(zip.files).filter((f) => !zip.files[f]!.dir)).toEqual(['index.html']);
    } finally {
      await app.close();
    }
  });

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
      await page.getByRole('button', { name: 'Import Crux, tool or Mood', exact: true }).click();
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
