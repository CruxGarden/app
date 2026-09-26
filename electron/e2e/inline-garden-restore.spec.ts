import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';
import { fileText } from './content-helpers';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

// Old conversion journeys are intentionally retired: the app accepts current
// installation archives only. Rejection must preserve the open working Crux.
for (const format of ['raw', 'old-container'] as const) {
  test(`Settings refuses ${format} Garden input without changing current work`, async () => {
    const launch = await launchApp();
    const input = join(launch.dir, 'unsupported.garden');
    try {
      const page = launch.page;
      await enterGarden(page);
      const id = await createCrux(page, 'Keep current work');
      await addArtifact(page, 'keep.txt');
      await page.locator('.monaco-editor').click();
      await page.keyboard.type('Current work remains');
      await page.keyboard.press('ControlOrMeta+s');
      const content = () => fileText(page, id, 'keep.txt');
      await expect.poll(content).toBe('Current work remains');
      const bytes = await page.evaluate(async () =>
        Array.from(new Uint8Array(await window.electronAPI!.sqlite.export())),
      );
      await launch.app.evaluate(
        async ({ app }, { input, bytes, format }) => {
          const fs = process.getBuiltinModule('fs');
          const path = process.getBuiltinModule('path');
          const load = process
            .getBuiltinModule('module')
            .createRequire(path.join(app.getAppPath(), 'package.json'));
          if (format === 'raw') fs.writeFileSync(input, Buffer.from(bytes));
          else {
            const JSZip = load('jszip');
            const zip = new JSZip();
            zip.file('garden.sqlite', Buffer.from(bytes));
            zip.file('manifest.json', JSON.stringify({ version: '2.0' }));
            fs.writeFileSync(input, await zip.generateAsync({ type: 'nodebuffer' }));
          }
        },
        { input, bytes, format },
      );
      await togglePanel(page, 'Toggle settings');
      await page
        .getByTestId('pane-body-settings')
        .getByRole('button', { name: 'Garden', exact: true })
        .click();
      await page.locator('input[type=file][accept=".garden"]').setInputFiles(input);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(
        page.getByText(
          format === 'raw'
            ? /expected a current ZIP archive/
            : /Unsupported .garden format version/,
        ),
      ).toBeVisible();
      expect(await content()).toBe('Current work remains');
      expect(await page.locator('[data-workspace-id]').getAttribute('data-workspace-id')).toBe(id);
    } finally {
      await launch.app.close();
    }
  });
}
