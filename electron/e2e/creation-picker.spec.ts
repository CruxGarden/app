import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('a short desktop window can browse and create a Crux without controls covering the choices', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1008, 655),
    );
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Crux', exact: true });
    await dialog.getByRole('button', { name: /^Blank/ }).click({ timeout: 5000 });
    await dialog.getByLabel('Find a starting point').fill('Hello');
    await dialog.locator('[data-template-id="hello-world"]').click();
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
    const evidence = resolve(__dirname, '../../docs/product-review/2026-09-30');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, 'polished-creation-picker-short.png') });
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Edit my home page', exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});
