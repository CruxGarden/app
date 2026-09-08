import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact, storedCrux, switchCrux } from './multi-crux-helpers';

test('close cancels or saves only the chosen workspace, and reopen restores its saved file', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const alpha = await createCrux(page, 'Alpha');
    await addArtifact(page, 'shared.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Saved Alpha');
    await expect(page.locator('.monaco-editor')).toContainText('Saved Alpha');
    await createCrux(page, 'Beta');
    await page.getByPlaceholder('Send a message...').fill('Beta draft');
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Alpha workspace' }).click();
    await page
      .getByRole('dialog', { name: 'Close workspace' })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText('Beta');
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Alpha workspace' }).click();
    await page.getByRole('button', { name: 'Save and close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue('Beta draft');
    const meta = await storedCrux(page, alpha);
    expect(readFileSync(join(meta.projectFolder, 'shared.txt'), 'utf8')).toBe('Saved Alpha');
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await expect(page.getByRole('button', { name: 'Close Alpha workspace' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open another Crux…' }).click();
    await page.getByRole('textbox', { name: 'Find a Crux in your garden' }).fill('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.locator('.monaco-editor')).toContainText('Saved Alpha');
  } finally {
    await app.close();
  }
});

test('window close guards hidden edits, saves all, and relaunch restores membership lazily', async () => {
  const first = await launchApp();
  const { app, page, dir } = first;
  let exited = false;
  try {
    await enterGarden(page);
    const alpha = await createCrux(page, 'Alpha');
    await addArtifact(page, 'hidden.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Hidden Alpha');
    await expect(page.locator('.monaco-editor')).toContainText('Hidden Alpha');
    await createCrux(page, 'Beta');
    await page.getByPlaceholder('Send a message...').fill('Remember Beta');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    const dialog = page.getByRole('dialog', { name: 'Close Crux Garden' });
    await expect(dialog).toContainText('Alpha');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue('Remember Beta');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    const stopped = app.waitForEvent('close');
    await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
    await stopped;
    exited = true;
    const second = await launchApp({ dir });
    try {
      await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect(
        second.page.getByRole('button', { name: 'Switch Crux workspace' }),
      ).toContainText('Beta');
      await expect(second.page.getByPlaceholder('Send a message...')).toHaveValue('Remember Beta');
      await second.page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await expect(second.page.getByRole('button', { name: /^Alpha Not loaded/ })).toBeVisible();
      await second.page.keyboard.press('Escape');
      await switchCrux(second.page, 'Alpha');
      await expect(second.page.locator('.monaco-editor')).toContainText('Hidden Alpha');
      const meta = await storedCrux(second.page, alpha);
      expect(readFileSync(join(meta.projectFolder, 'hidden.txt'), 'utf8')).toBe('Hidden Alpha');
    } finally {
      await second.app.close();
    }
  } finally {
    if (!exited) await app.close();
  }
});
