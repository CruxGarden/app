import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux, addArtifact } from './multi-crux-helpers';
test('A/B workspaces retain separate editor buffers, drafts and undo history', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Alpha');
    await page.getByPlaceholder('Send a message...').fill('draft Alpha');
    await addArtifact(page, 'same.txt');
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.type('Alpha unsaved');
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('Alpha unsaved');
    await createCrux(page, 'Beta');
    await page.getByPlaceholder('Send a message...').fill('draft Beta');
    await addArtifact(page, 'same.txt');
    await editor.click();
    await page.keyboard.type('Beta unsaved');
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('Beta unsaved');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+k' : 'Control+Alt+k');
    await page.getByRole('textbox', { name: 'Find an open Crux' }).fill('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue('draft Alpha');
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('Alpha unsaved');
    await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('Beta unsaved');
    await page.keyboard.type('!');
    await expect(page.locator('.monaco-editor')).toContainText('Alpha unsaved!');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('Alpha unsaved');
    await switchCrux(page, 'Beta');
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue('draft Beta');
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('Beta unsaved');
  } finally {
    await app.close();
  }
});
test('opening an existing Crux and Back/Forward never duplicates its workspace', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Alpha');
    await createCrux(page, 'Beta');
    await switchCrux(page, 'Alpha');
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText('Beta');
    await page.goForward();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Alpha',
    );
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await expect(page.getByRole('button', { name: 'Close Alpha workspace' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Close Beta workspace' })).toHaveCount(1);
  } finally {
    await app.close();
  }
});
