import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
test('keyboard-only search, MRU commit/reverse/cancel and composer focus', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const shortcut = process.platform === 'darwin' ? 'Meta+Alt+k' : 'Control+Alt+k';
  try {
    await enterGarden(page);
    await createCrux(page, 'Alpha');
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('A draft');
    await createCrux(page, 'Beta');
    await input.fill('B draft');
    await createCrux(page, 'Gamma');
    await input.fill('C draft');
    await page.keyboard.press(shortcut);
    const search = page.getByRole('textbox', { name: 'Find an open Crux' });
    await expect(search).toBeFocused();
    await page.keyboard.type('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Alpha',
    );
    await expect(input).toBeFocused();
    await page.keyboard.type(' continued');
    await expect(input).toHaveValue('A draft continued');
    await page.keyboard.down('Control');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.keyboard.up('Control');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Alpha',
    );
    await expect(input).toBeFocused();
    await page.keyboard.down('Control');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Control');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Gamma',
    );
    await expect(input).toHaveValue('C draft');
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText('Beta');
    await page.keyboard.press(shortcut);
    await page.keyboard.type('no such crux');
    await expect(page.getByRole('status')).toContainText('No matching');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(input).toBeFocused();
  } finally {
    await app.close();
  }
});

test('zero/one workspace, modal precedence, and keyboard-only close at a narrow width', async () => {
  const { app, page } = await launchApp();
  const shortcut = process.platform === 'darwin' ? 'Meta+Alt+k' : 'Control+Alt+k';
  try {
    await enterGarden(page);
    await page.keyboard.down('Control');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Control');
    await expect(page.getByRole('status', { name: 'Recent Cruxes' })).toHaveCount(0);
    await page.keyboard.press(shortcut);
    await expect(page.getByRole('dialog', { name: 'Switch Crux workspace' })).toContainText(
      'No matching Cruxes',
    );
    await page.keyboard.press('Escape');
    await createCrux(page, 'Alpha');
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Alpha draft');
    await page.keyboard.down('Control');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Control');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Alpha draft');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.keyboard.press(shortcut);
    await expect(page.getByRole('dialog', { name: 'Switch Crux workspace' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 800, height: 700 });
    await page.keyboard.press(shortcut);
    const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
    await expect(dialog.getByRole('textbox', { name: 'Find an open Crux' })).toBeFocused();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(800);
    await page.keyboard.press('Tab'); // workspace row
    await page.keyboard.press('Tab'); // row's Close action
    await expect(page.getByRole('button', { name: 'Close Alpha workspace' })).toBeFocused();
    await page.keyboard.press('Enter');
    const close = page.getByRole('dialog', { name: 'Close workspace' });
    await expect(close.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(close.getByRole('button', { name: 'Save and close' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    await page.keyboard.press(shortcut);
    await expect(page.getByRole('dialog')).toContainText('No matching Cruxes');
  } finally {
    await app.close();
  }
});
