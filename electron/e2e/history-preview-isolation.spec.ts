import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, addArtifact } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('historical HTML shows saved source without mounting the live preview or changing current files', async () => {
  let launch = await launchApp();
  const { page, dir } = launch;
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Historical preview');
    const meta = await storedCrux(page, id);
    const path = join(meta.projectFolder, 'index.html');
    const earlier = '<h1>Earlier saved page</h1>';
    const current = '<h1>Current live page</h1>';
    await addArtifact(page, 'index.html');
    writeFileSync(path, earlier);
    await expect(page.locator('.monaco-editor').first()).toContainText('Earlier saved page');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
      'Earlier saved page',
    );
    await togglePanel(page, 'Toggle history');
    const history = page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Earlier page');
    await history.getByPlaceholder('Label (optional)').press('Enter');
    await expect(history.getByText('Earlier page', { exact: true })).toBeVisible();
    writeFileSync(path, current);
    await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
      'Current live page',
    );
    await history.getByText('Earlier page', { exact: true }).click();
    await expect(page.getByText('read-only', { exact: true })).toBeVisible();
    await expect(page.locator('.monaco-editor').first()).toContainText('Earlier saved page');
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.type('This must not edit history');
    await expect(page.locator('.monaco-editor').first()).not.toContainText(
      'This must not edit history',
    );
    await expect(page.locator('iframe[data-crux-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
    await expect(page.getByTitle('Capture preview (saves as preview.jpg)')).toHaveCount(0);
    expect(readFileSync(path, 'utf8')).toBe(current);
    await page.screenshot({ path: 'e2e/.results/history-preview-source.png' });
    await history.getByRole('button', { name: 'Back to current' }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
      'Current live page',
    );
    expect(readFileSync(path, 'utf8')).toBe(current);
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    await expect(launch.page.locator('[data-workspace-id]')).toBeVisible();
    const reopenedHistory = launch.page.getByTestId('pane-body-history');
    if (!(await reopenedHistory.isVisible())) await togglePanel(launch.page, 'Toggle history');
    await reopenedHistory.getByText('Earlier page', { exact: true }).click();
    await launch.page.getByRole('tree').getByText('index.html', { exact: true }).click();
    await expect(launch.page.locator('.monaco-editor').first()).toContainText('Earlier saved page');
    await expect(launch.page.locator('iframe[data-crux-id]')).toHaveCount(0);
    expect(readFileSync(path, 'utf8')).toBe(current);
  } finally {
    await launch.app.close();
  }
});
