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
  if (!(await page.getByTestId('pane-body-artifacts').isVisible())) await toggle.click();
  await newFile.click();
  const input = page.getByRole('tree').getByRole('textbox');
  await input.fill(path);
  await input.press('Enter');
  await page.getByRole('tree').getByText(path, { exact: true }).click();
  await expect(page.locator('.monaco-editor textarea').first()).toBeVisible();
}

/**
 * The Mood browser's shelf (Daniel, 2026-09-19): the earlier renders and the
 * Office study sit collapsed under the bundled set. Open it before picking one.
 */
export async function openMoodShelf(page: Page) {
  const shelf = page.getByTestId('shelved-moods');
  if (!(await shelf.evaluate((el) => (el as HTMLDetailsElement).open)))
    await shelf.locator('summary').click();
}

/**
 * Wear a material Mood from the Mood browser's picker (open the Mood menu
 * first): the id names its material, hue and mode — `plasma-fjord`,
 * `soft-black`, `umber`… (MaterialMoods.tsx).
 */
export async function wearMaterial(page: Page, id: string) {
  const hues: Record<string, [string, string]> = {
    neutral: ['soft-white', 'soft-black'],
    gray: ['soft-gray', 'graphite'],
    parchment: ['parchment', 'umber'],
    fjord: ['fjord', 'harbor'],
    blush: ['blush', 'mulberry'],
    sage: ['sage', 'moss'],
    lilac: ['lilac', 'plum'],
  };
  const material = id.startsWith('plasma-') ? 'Plasma' : 'Soft';
  const tone = id.replace(/^plasma-/, '');
  const hue = Object.entries(hues).find(([, [l, d]]) => l === tone || d === tone);
  if (!hue) throw new Error(`${id} is not a material Mood`);
  const mode = hue[1][0] === tone ? 'Light' : 'Dark';
  const picker = page.getByTestId('material-moods');
  await picker.getByTestId('material-material').getByRole('button', { name: material }).click();
  await picker.getByTestId('material-mode').getByRole('button', { name: mode }).click();
  await picker
    .getByTestId('material-hue')
    .getByRole('button', { name: hue[0][0].toUpperCase() + hue[0].slice(1), exact: true })
    .click();
}
