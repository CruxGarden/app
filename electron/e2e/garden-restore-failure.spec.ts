import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('Garden restore preserves existing work on disk failure and retries cleanly across restart', async () => {
  let instance = await launchApp();
  const dir = instance.dir;
  const archive = join(dir, 'recovery.garden');
  try {
    let page = instance.page;
    const openData = async () => {
      const pane = page.getByTestId('pane-body-settings');
      if (!(await pane.isVisible())) await togglePanel(page, 'Toggle settings');
      await expect(pane).toBeVisible();
      const garden = pane.getByRole('button', { name: 'Garden', exact: true });
      await expect(garden).toBeVisible();
      if (!(await pane.getByRole('button', { name: 'Import garden', exact: true }).count()))
        await garden.click();
    };
    await enterGarden(page);
    const original = await createCrux(page, 'Original work');
    await addArtifact(page, 'original.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Original exported content');
    await page.keyboard.press('ControlOrMeta+s');
    await openData();
    await instance.app.evaluate(({ session }, destination) => {
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(destination);
        item.once('done', (_event, state) => {
          (globalThis as any).__gardenExport = state;
        });
      });
    }, archive);
    await page.getByRole('button', { name: 'Export garden', exact: true }).click();
    await expect
      .poll(() => instance.app.evaluate(() => (globalThis as any).__gardenExport))
      .toBe('completed');
    await togglePanel(page, 'Toggle settings');
    const existing = await createCrux(page, 'Keep after failure');
    await addArtifact(page, 'keep.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Current work must survive');
    await page.keyboard.press('ControlOrMeta+s');

    const content = (id: string, filename: string) =>
      page.evaluate(
        async ({ id, filename }) => {
          const row = (await window.electronAPI!.sqlite.get(
            'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
            [id, filename],
          )) as { fingerprint: string } | undefined;
          if (!row) return null;
          return new TextDecoder().decode(
            await window.electronAPI!.sqlite.blobRead(row.fingerprint),
          );
        },
        { id, filename },
      );
    await expect.poll(() => content(existing, 'keep.txt')).toBe('Current work must survive');

    await instance.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const write = SqliteNative.prototype.blobWrite;
      (globalThis as any).__failRestoreWrites = true;
      SqliteNative.prototype.blobWrite = function (...args: unknown[]) {
        if ((globalThis as any).__failRestoreWrites) throw new Error('Simulated restore disk full');
        return write.apply(this, args);
      };
    });
    await openData();
    const importArchive = async () => {
      await page.locator('input[type=file][accept=".garden"]').setInputFiles(archive);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    };
    await importArchive();
    await expect(page.getByText(/Simulated restore disk full/)).toBeVisible();
    expect(await content(existing, 'keep.txt')).toBe('Current work must survive');
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    expect(await content(existing, 'keep.txt')).toBe('Current work must survive');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Keep after failure',
    );
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      existing,
    );
    // Replacement deliberately requires closing every workspace first.
    for (const title of ['Original work', 'Keep after failure']) {
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page.getByRole('button', { name: `Close ${title} workspace` }).click();
      await page.getByRole('button', { name: 'Save and close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page
      .getByRole('dialog', { name: 'Settings', exact: true })
      .getByRole('button', { name: 'Garden', exact: true })
      .click();
    await importArchive();
    await expect.poll(() => content(original, 'original.txt')).toBe('Original exported content');
    await expect.poll(() => content(existing, 'keep.txt')).toBeNull();
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    expect(await content(original, 'original.txt')).toBe('Original exported content');
  } finally {
    await instance.app.close();
  }
});
