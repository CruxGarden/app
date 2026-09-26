import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';
import { fileText } from './content-helpers';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

for (const fault of ['disk failure', 'missing content'] as const) {
  test(`Garden restore preserves existing work on ${fault} and retries cleanly across restart`, async () => {
    let instance = await launchApp();
    const dir = instance.dir;
    const archive = join(dir, 'recovery.garden');
    const incomplete = join(dir, 'incomplete.garden');
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
      if (fault === 'missing content') {
        await instance.app.evaluate(
          async ({ app }, { archive, incomplete }) => {
            const path = process.getBuiltinModule('path');
            const fs = process.getBuiltinModule('fs');
            const load = process
              .getBuiltinModule('module')
              .createRequire(path.join(app.getAppPath(), 'package.json'));
            const JSZip = load('jszip');
            const zip = await JSZip.loadAsync(fs.readFileSync(archive));
            const manifest = JSON.parse(await zip.file('manifest.json').async('text'));
            const blob = Object.keys(zip.files).find(
              (name) => name.startsWith('artifacts/') && !zip.files[name].dir,
            );
            if (!blob) throw new Error('Fixture must contain a referenced blob');
            zip.remove(blob);
            zip.file(
              'manifest.json',
              JSON.stringify({ ...manifest, artifactCount: manifest.artifactCount - 1 }),
            );
            fs.writeFileSync(incomplete, await zip.generateAsync({ type: 'nodebuffer' }));
          },
          { archive, incomplete },
        );
      }
      await togglePanel(page, 'Toggle settings');
      const existing = await createCrux(page, 'Keep after failure');
      await addArtifact(page, 'keep.txt');
      await page.locator('.monaco-editor').click();
      await page.keyboard.type('Current work must survive');
      await page.keyboard.press('ControlOrMeta+s');

      const content = (id: string, filename: string) => fileText(page, id, filename);
      await expect.poll(() => content(existing, 'keep.txt')).toBe('Current work must survive');

      if (fault === 'disk failure')
        await instance.app.evaluate(({ app }) => {
          const path = process.getBuiltinModule('path');
          const load = process
            .getBuiltinModule('module')
            .createRequire(path.join(app.getAppPath(), 'package.json'));
          const { NativeBlobStore } = load('./dist/native-blobs.js');
          const write = NativeBlobStore.prototype.blobWrite;
          (globalThis as any).__failRestoreWrites = true;
          NativeBlobStore.prototype.blobWrite = function (...args: unknown[]) {
            if ((globalThis as any).__failRestoreWrites)
              throw new Error('Simulated restore disk full');
            return write.apply(this, args);
          };
        });
      await openData();
      const importArchive = async (source = archive) => {
        await page.locator('input[type=file][accept=".garden"]').setInputFiles(source);
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
      };
      await importArchive(fault === 'missing content' ? incomplete : archive);
      await expect(
        page.getByText(
          fault === 'missing content' ? /missing required content/ : /Simulated restore disk full/,
        ),
      ).toBeVisible();
      expect(await content(original, 'original.txt')).toBe('Original exported content');
      expect(await content(existing, 'keep.txt')).toBe('Current work must survive');
      // launchApp's teardown bypasses the normal quit guard. Wait for the
      // asynchronous workspace preference write before forcing that shutdown.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const row = (await window.electronAPI!.sqlite.get(
              'SELECT value FROM settings WHERE key = ?',
              ['cruxgarden:open-workspaces:v1'],
            )) as { value: string } | undefined;
            return row ? JSON.parse(row.value).lastActiveCruxId : null;
          }),
        )
        .toBe(existing);
      await instance.app.close();
      instance = await launchApp({ dir });
      page = instance.page;
      await page.getByRole('button', { name: /enter/i }).click();
      expect(await content(existing, 'keep.txt')).toBe('Current work must survive');
      await page.getByRole('button', { name: 'Open Keep after failure', exact: true }).click();
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
      await openData();
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
}
