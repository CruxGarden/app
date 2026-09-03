import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Your own files in a Mood: an image added under Assets becomes the workspace
 * texture (a token that resolves to a blob URL), a pane texture, and the cover
 * of the next saved Mood; grain is a token too.
 */
test.describe('mood assets', () => {
  test.setTimeout(150_000);

  test('add an image → texture, pane texture, cover; grain token', async () => {
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await page.getByRole('button', { name: 'Assets', exact: true }).click();

      await page
        .locator('input[type="file"][aria-label="Add asset files"]')
        .setInputFiles(join(__dirname, 'fixtures', 'backdrop.png'));
      await expect(page.getByRole('status')).toContainText('Added 1 file');
      const card = page.locator('[data-testid^="asset-"]').first();
      await expect(card).toContainText('backdrop.png');

      // Workspace texture → the token resolves to a blob URL and the layer paints it
      await card.getByRole('button', { name: 'Workspace texture' }).click();
      await expect
        .poll(() => cssVar('--workspace-texture'), { timeout: 10_000 })
        .toMatch(/^url\("blob:/);
      await expect(page.locator('.mood-texture')).toHaveCSS('background-image', /blob:/);

      // Pane texture on the Workshop
      await card.getByRole('button', { name: 'Pane texture' }).click();
      await expect
        .poll(() => cssVar('--pane-workshop-texture'), { timeout: 10_000 })
        .toMatch(/^url\("blob:/);

      // Grain is a token
      await page.getByRole('button', { name: 'Tokens', exact: true }).click();
      await page.getByRole('button', { name: 'Textures & grain' }).click();
      const grain = page.getByRole('textbox', { name: 'Grain opacity value' });
      await grain.fill('0.4');
      await grain.press('Enter');
      await expect(page.locator('.mood-grain')).toHaveCSS('opacity', '0.4');
      // The texture token shows as an asset row with a picker
      await expect(page.getByRole('combobox', { name: 'Workspace texture asset' })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/assets-1-tokens.png' });

      // Cover → the saved Mood shows the image
      await page.getByRole('button', { name: 'Assets', exact: true }).click();
      await card.getByRole('button', { name: 'Cover', exact: true }).click();
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await page.getByRole('button', { name: 'Save current as Mood' }).click();
      await page.getByRole('textbox', { name: 'Mood name' }).fill('Textured');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const mood = page.getByTestId('mood-mood-textured');
      await expect(mood).toBeVisible();
      await expect(mood.locator('img')).toHaveAttribute('src', /blob:/);
      await page.screenshot({ path: 'e2e/.results/assets-2-browser.png' });

      // Back in the workspace the Workshop pane wears the texture
      await page.getByRole('button', { name: 'Done' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const body = page.locator('.mosaic-window.pane-workshop .mosaic-window-body').first();
      await expect(body).toBeVisible({ timeout: 30_000 });
      await expect(body).toHaveCSS('background-image', /blob:/);
      await page.screenshot({ path: 'e2e/.results/assets-3-workspace.png' });
    } finally {
      await app.close();
    }
  });
});
