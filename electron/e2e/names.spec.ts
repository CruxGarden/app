import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { hidePane } from './panel-helpers';

/**
 * Names (Daniel, 2026-09-20): the garden's title and its panes' words are the
 * garden's to choose — Settings → Names renames the Garden and names the panes; the top bar and every
 * pane header read them, and the journeys' own selectors (Toggle collaboration)
 * keep the default words.
 */
test('a garden names itself and its panes', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Case 4471');
    await page.keyboard.press('ControlOrMeta+,');
    const names = page.getByTestId('names-settings');
    await expect(names).toBeVisible();
    await names.getByLabel('Garden title').fill('Floyd County Police Department');
    await names.getByLabel('Garden title').press('Enter');
    await names.getByText('Custom panel names', { exact: true }).click();
    await names.getByLabel('Name for Collaboration').fill('Interview room');
    await names.getByLabel('Name for Collaboration').press('Enter');
    await names.getByLabel('Name for Artifacts').fill('Case files');
    await names.getByLabel('Name for Artifacts').press('Enter');
    await hidePane(page, 'Settings');

    // The top bar carries the title; the pane headers carry the words;
    // the toggles keep their accessible names and show the new word as a tooltip.
    await expect(page.locator('header').getByText('Floyd County Police Department')).toBeVisible();
    await expect(page.locator('.pane-toolbar-label', { hasText: 'Interview room' })).toBeVisible();
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find a panel' }).fill('Case files');
    await expect(page.getByRole('dialog', { name: 'Add panel' })).toContainText('Case files');
    await page.getByRole('button', { name: 'Toggle artifacts', exact: true }).click();
    await expect(page.locator('.pane-toolbar-label', { hasText: 'Case files' })).toBeVisible();
    await page.screenshot({ path: 'e2e/.results/names.png' });

    // Cleared, the usual words return.
    await page.keyboard.press('ControlOrMeta+,');
    await names.getByText('Custom panel names', { exact: true }).click();
    await names.getByLabel('Name for Collaboration').fill('');
    await names.getByLabel('Name for Collaboration').press('Enter');
    await hidePane(page, 'Settings');
    await expect(page.locator('.pane-toolbar-label', { hasText: 'Collaboration' })).toBeVisible();
  } finally {
    await app.close();
  }
});
