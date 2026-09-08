import { expect, type Page } from '@playwright/test';
export async function enterGarden(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
}
export async function createCrux(page: Page, title: string) {
  // The garden breadcrumb remains reachable while existing workspaces stay open.
  if (/\/c\//.test(page.url())) await page.locator('header').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByPlaceholder('My Crux').fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(title);
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}
export async function switchCrux(page: Page, title: string) {
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
  await dialog.getByRole('button', { name: new RegExp(`^(✓ )?${title} `) }).click();
  await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(title);
}
export async function storedCrux(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const row = (await window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [
      id,
    ])) as { meta: string };
    return JSON.parse(row.meta);
  }, id);
}
export async function addArtifact(page: Page, path: string) {
  const newFile = page.getByRole('button', { name: 'New file', exact: true });
  const toggle = page.getByRole('button', { name: 'Toggle artifacts' });
  if ((await toggle.getAttribute('aria-pressed')) === 'false') await toggle.click();
  await newFile.click();
  const input = page.getByRole('tree').getByRole('textbox');
  await input.fill(path);
  await input.press('Enter');
  await page.getByRole('tree').getByText(path, { exact: true }).click();
  await expect(page.locator('.monaco-editor textarea').first()).toBeVisible();
}
