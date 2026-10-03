import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { createCrux, enterGarden, reenterWorkspace, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

/**
 * Files journey: the Artifacts pane against a real Project Folder.
 *
 *   new file → appears in tree AND on disk → rename → new folder (its .keep
 *   marker stays invisible) → keyboard Delete on the folder → app confirm
 *   dialog → gone from tree and disk → delete file via context menu, cancel,
 *   then confirm.
 *
 * Also the regression suite for: window.confirm (blocked Playwright, stole
 * focus in Electron) → app dialogs; keyboard Delete forwarding folder ids
 * that deleteArtifacts silently skipped; `.keep` rendered as a file.
 */
test.describe('files (Artifacts pane + Project Folder)', () => {
  test.setTimeout(120_000);

  test('create, rename, folder, delete — tree and disk agree', async () => {
    const { app, page } = await launchApp();
    let projectFolder: string;
    const onDisk = (rel: string) => existsSync(join(projectFolder, rel));

    try {
      // Fresh garden → empty Crux → explicitly open file tools
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'Add files', exact: true }).click();
      // An empty crux shows a drop zone, not a tree — the toolbar is the anchor.
      const newFile = page.getByRole('button', { name: 'New file' });
      await expect(newFile).toBeVisible({ timeout: 30_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      projectFolder = (await storedCrux(page, id)).projectFolder;

      // ── New file ─────────────────────────────────────────────────────────
      await newFile.click();
      const tree = page.getByRole('tree'); // appears with the inline name input
      const nameInput = tree.getByRole('textbox');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('notes.md');
      await nameInput.press('Enter');
      await expect(tree.getByText('notes.md', { exact: true })).toBeVisible();
      await expect.poll(() => onDisk('notes.md')).toBe(true); // write-through
      await page.screenshot({ path: 'e2e/.results/files-1-created.png' });

      // ── Rename via context menu ──────────────────────────────────────────
      await tree.getByText('notes.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Rename' }).click();
      const renameInput = tree.getByRole('textbox');
      await renameInput.fill('readme.md');
      await renameInput.press('Enter');
      await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();
      await expect(tree.getByText('notes.md', { exact: true })).toHaveCount(0);
      await expect.poll(() => onDisk('readme.md') && !onDisk('notes.md')).toBe(true);

      // ── New folder: shown as a folder, its .keep marker invisible ────────
      await page.getByRole('button', { name: 'New folder' }).click();
      const folderInput = tree.getByRole('textbox');
      await folderInput.fill('docs');
      await folderInput.press('Enter');
      await expect(tree.getByText('docs', { exact: true })).toBeVisible();
      await expect(tree.getByText('.keep')).toHaveCount(0);
      await expect.poll(() => onDisk('docs/.keep')).toBe(true);
      await page.screenshot({ path: 'e2e/.results/files-2-folder.png' });

      // ── Rename onto an existing name asks first; Cancel keeps both ───────
      await page.getByRole('button', { name: 'New file' }).click();
      const secondInput = tree.getByRole('textbox');
      await secondInput.fill('other.md');
      await secondInput.press('Enter');
      await expect(tree.getByText('other.md', { exact: true })).toBeVisible();
      await tree.getByText('other.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Rename' }).click();
      const conflictInput = tree.getByRole('textbox');
      await conflictInput.fill('readme.md');
      await conflictInput.press('Enter');
      const conflict = page.getByRole('dialog').filter({ hasText: 'already exists' });
      await expect(conflict).toBeVisible();
      await conflict.getByRole('button', { name: 'Cancel' }).click();
      await expect(tree.getByText('other.md', { exact: true })).toBeVisible();
      await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();
      await expect.poll(() => onDisk('other.md') && onDisk('readme.md')).toBe(true);
      // clean up the extra file so the rest of the journey is unchanged
      await tree.getByText('other.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('other.md', { exact: true })).toHaveCount(0);

      // ── Keyboard Delete on the folder → app dialog (not window.confirm) ──
      await tree.getByText('docs', { exact: true }).click();
      await page.keyboard.press('Delete');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(/Delete this folder/);
      await page.screenshot({ path: 'e2e/.results/files-3-confirm.png' });
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('docs', { exact: true })).toHaveCount(0);
      await expect.poll(() => onDisk('docs')).toBe(false);

      // ── Delete file: cancel keeps it, confirm removes it ─────────────────
      await tree.getByText('readme.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();

      await tree.getByText('readme.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('readme.md', { exact: true })).toHaveCount(0);
      await expect.poll(() => onDisk('readme.md')).toBe(false);
      await page.screenshot({ path: 'e2e/.results/files-4-empty.png' });
    } finally {
      await app.close();
    }
  });
});

test('rename Replace preserves recoverable originals and unrelated work across restart', async () => {
  test.setTimeout(180_000);
  let instance = await launchApp();
  const { dir } = instance;
  try {
    let page = instance.page;
    await enterGarden(page);
    const id = await createCrux(page, 'Rename replacement');
    await togglePanel(page, 'Toggle artifacts');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const files = [
      ['source.txt', 'Source original'],
      ['target.txt', 'Target original'],
    ];
    for (const [name, bytes] of files) writeFileSync(join(dir, name!), bytes!);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Files…', exact: true }).click();
    await (await chooser).setFiles(files.map(([name]) => join(dir, name!)));
    const tree = page.getByRole('tree');
    await expect(tree.getByText('source.txt', { exact: true })).toBeVisible();
    await expect(tree.getByText('target.txt', { exact: true })).toBeVisible();
    writeFileSync(join(folder, 'unrelated.txt'), 'External work survives');
    await tree.getByText('source.txt', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await tree.getByRole('textbox').fill('target.txt');
    await tree.getByRole('textbox').press('Enter');
    const conflict = page.getByRole('dialog').filter({ hasText: 'already exists' });
    await expect(conflict).toBeVisible();
    await conflict.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect(tree.getByText('source.txt', { exact: true })).toHaveCount(0);
    await expect
      .poll(() => readFileSync(join(folder, 'target.txt'), 'utf8'))
      .toBe('Source original');
    expect(readFileSync(join(folder, 'unrelated.txt'), 'utf8')).toBe('External work survives');
    const safety = await page.evaluate(async (id) => {
      const content = window.electronAPI!.sqlite.fileContent!;
      const history = await content.history(id);
      for (const checkpoint of history.checkpoints.filter((x) => x.reason === 'safety')) {
        const inspected = await content.inspectCheckpoint(id, checkpoint.id);
        if (
          inspected.files.some((x) => x.path === 'source.txt') &&
          inspected.files.some((x) => x.path === 'target.txt')
        )
          return checkpoint;
      }
      return null;
    }, id);
    expect(safety).not.toBeNull();
    await page.screenshot({ path: 'e2e/.results/files-replace.png' });
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await reenterWorkspace(page, 'Rename replacement');
    expect(existsSync(join(folder, 'source.txt'))).toBe(false);
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Source original');
    expect(readFileSync(join(folder, 'unrelated.txt'), 'utf8')).toBe('External work survives');
    expect(
      await page.evaluate(
        async ({ id, checkpoint }) => {
          const content = window.electronAPI!.sqlite.fileContent!;
          return (await content.inspectCheckpoint(id, checkpoint!)).files.map((x) => x.path);
        },
        { id, checkpoint: safety?.id },
      ),
    ).toEqual(expect.arrayContaining(['source.txt', 'target.txt']));
  } finally {
    await instance.app.close();
  }
});
