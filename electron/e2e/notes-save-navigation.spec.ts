import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('Notes retains an invalid-title draft, saves after correction and reopens it after restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const { dir } = instance;
  try {
    const { page } = instance;
    await page.setViewportSize({ width: 2600, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Safe notebook');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const readWelcome = () => readFileSync(join(folder, 'notebook/Welcome.md'), 'utf8');
    const frame = page.frameLocator('iframe[data-crux-id]');
    const title = frame.getByLabel('Note title', { exact: true });
    await expect(title).toHaveValue('Welcome');
    await expect(frame.locator('.save-state')).toHaveAttribute('data-tooltip', 'Saved');
    const showSidebar = frame.getByRole('button', { name: 'Show left sidebar', exact: true });
    if (await showSidebar.isVisible()) await showSidebar.click();
    await frame.getByRole('button', { name: 'Add Note or Folder', exact: true }).click();
    await frame.getByRole('menuitem', { name: /New Note/ }).click();
    await frame.getByRole('button', { name: 'Untitled', exact: true }).first().click();
    await expect(title).toHaveValue('Untitled');
    await title.fill('Other');
    await title.press('Enter');
    const other = frame.locator('button[data-note-path="Other.md"]');
    await expect(other).toBeVisible();
    await frame.locator('button[data-note-path="Welcome.md"]').click();
    await expect(title).toHaveValue('Welcome');
    const original = readWelcome();
    const body = frame.locator('.tiptap').first();
    await title.fill('Invalid: title');
    await body.fill('Keep this draft through a refused navigation.');
    await other.click();
    await expect(frame.locator('.note-error')).toContainText('Note titles cannot contain');
    await expect(title).toHaveValue('Invalid: title');
    await expect(body).toContainText('Keep this draft through a refused navigation.');
    await expect(frame.locator('.save-state')).toHaveAttribute('data-tooltip', 'Unsaved');
    expect(readWelcome()).toBe(original);

    await title.fill('Welcome');
    await other.click();
    await expect(title).toHaveValue('Other');
    await expect.poll(readWelcome).toContain('Keep this draft through a refused navigation.');
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.setViewportSize({ width: 2600, height: 1100 });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.getByRole('button', { name: 'Open Safe notebook', exact: true }).click();
    const reopened = instance.page.frameLocator('iframe[data-crux-id]');
    await reopened.locator('button[data-note-path="Welcome.md"]').click();
    await expect(reopened.getByLabel('Note title', { exact: true })).toHaveValue('Welcome');
    await expect(reopened.locator('.tiptap').first()).toContainText(
      'Keep this draft through a refused navigation.',
    );
    expect(readWelcome()).toContain('Keep this draft through a refused navigation.');
  } finally {
    await instance.app.close();
  }
});
