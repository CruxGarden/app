import { expect, type Page } from '@playwright/test';
import { showPane } from '../panel-helpers';

/**
 * The v1 journeys' shared moves, written against the current chrome: Garden
 * Home as the entry, every supporting surface a workspace pane, Growth
 * deliberate ("Mark version"), routine edits in Edit history.
 */

/** Type into the open Crux's first file and save. */
export async function writeFirstFile(page: Page, name: string, text: string) {
  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
  const input = page.getByRole('tree').getByRole('textbox');
  await input.fill(name);
  await input.press('Enter');
  const monaco = page.locator('.monaco-editor').first();
  await expect(monaco).toBeVisible({ timeout: 30_000 });
  await monaco.click();
  await page.keyboard.type(text);
  await page.keyboard.press('ControlOrMeta+s');
  return monaco;
}

/** Mark a version in the History pane and wait for its card. */
export async function markVersion(page: Page, label: string) {
  const history = page.getByTestId('pane-body-history');
  if (!(await history.count())) {
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add panel' });
    await picker.getByRole('textbox', { name: 'Find a panel' }).fill('history');
    await picker.getByRole('button', { name: 'Toggle history', exact: true }).click();
  }
  await expect(history).toBeVisible({ timeout: 30_000 });
  await history.getByRole('button', { name: 'Mark version', exact: true }).click();
  await history.getByPlaceholder('Label (optional)').fill(label);
  await history.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(history.getByText(label, { exact: true })).toBeVisible({ timeout: 30_000 });
  return history;
}

/** Connect the account from wherever a sign-in form is showing. */
export async function connectAccount(page: Page, scope: Page | ReturnType<Page['locator']> = page) {
  await scope.getByPlaceholder('email@example.com').fill('tester@example.com');
  await scope.getByRole('button', { name: 'Send Code' }).click();
  await scope.getByPlaceholder('Enter code').fill('123456');
  await scope.getByRole('button', { name: 'Connect', exact: true }).click();
}

/** Create a child Garden from Home and land in it. */
export async function newGarden(page: Page, name: string) {
  await page.getByRole('button', { name: 'New Garden', exact: true }).click();
  await page.getByRole('textbox', { name: 'Garden name' }).fill(name);
  await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(name);
}

/** Go to a Garden by name through the Navigator. */
export async function goToGarden(page: Page, name: string) {
  const nav = await showPane(page, 'Navigator');
  await nav.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(name);
}

/** Close an open Crux workspace from the switcher, saving what it holds. */
export async function closeWorkspace(page: Page, title: string) {
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  await page.getByRole('button', { name: `Close ${title} workspace` }).click();
  const dialog = page.getByRole('dialog', { name: 'Close workspace' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Save and close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
