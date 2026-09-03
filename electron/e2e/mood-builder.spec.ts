import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Mood Builder → Theme: a layout token (pane gap) and a per-pane surface token
 * (Workshop body) edited in the token editor reach the real workspace chrome,
 * and survive a restart of the app (they are stored per mode and re-applied
 * at boot on top of the preset).
 */
test.describe('mood builder', () => {
  test.setTimeout(150_000);

  test('theme tokens apply live and persist', async () => {
    const { app, page, dir } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // A crux so the workspace chrome exists to measure
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({ timeout: 30_000 });
      const tile = page.locator('.mosaic-tile').first();
      await expect(tile).toHaveCSS('margin-left', '4px');

      // Mood modal → Open Mood Builder → lands on the Theme tab
      await page.getByRole('button', { name: 'Mood' }).click();
      await expect(page.getByRole('heading', { name: 'Mood' })).toBeVisible();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await expect(page.getByRole('heading', { name: 'Mood Builder' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Mood', exact: true })).toHaveCount(0);

      // Shape & layout: gutters can be zeroed completely
      await page.getByRole('button', { name: 'Shape & layout' }).click();
      const gap = page.getByRole('textbox', { name: 'Pane gap value' });
      await gap.fill('0px');
      await gap.press('Enter');
      const pad = page.getByRole('textbox', { name: 'Workspace padding value' });
      await pad.fill('0px');
      await pad.press('Enter');
      await expect.poll(() => cssVar('--pane-gap')).toBe('0px');

      // Each pane has its own radius and label color
      await page.getByRole('button', { name: 'Collaboration pane' }).click();
      const radius = page.getByRole('textbox', { name: 'Radius value', exact: true });
      await radius.fill('0px');
      await radius.press('Enter');
      await expect.poll(() => cssVar('--pane-collaboration-radius')).toBe('0px');
      await page.getByRole('button', { name: 'Share pane' }).click();
      const heading = page.getByRole('textbox', { name: 'Heading value' });
      await heading.fill('#ff0000');
      await heading.press('Enter');
      await expect.poll(() => cssVar('--pane-publish-heading')).toBe('#ff0000');

      // Workshop pane body color, without touching the other panes
      await page.getByRole('button', { name: 'Workshop pane' }).click();
      const body = page.getByRole('textbox', { name: 'Body value' });
      await body.fill('#112233');
      await body.press('Enter');
      await expect.poll(() => cssVar('--pane-workshop-body')).toBe('#112233');
      await page.screenshot({ path: 'e2e/.results/mood-1-theme-tab.png' });

      // Back in the workspace: the chrome reflects every edit
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({ timeout: 30_000 });
      await expect(tile).toHaveCSS('margin-left', '0px');
      await expect(page.locator('.mosaic-root')).toHaveCSS('left', '0px');
      await expect(page.locator('.mosaic-window.pane-collaboration')).toHaveCSS(
        'border-radius',
        '0px',
      );
      await expect(page.locator('.mosaic-window.pane-workshop')).toHaveCSS('border-radius', '8px');
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await expect(
        page.locator('.mosaic-window.pane-publish').getByText('Nothing to share yet'),
      ).toHaveCSS('color', 'rgb(255, 0, 0)');
      const workshop = page.locator('.mosaic-window.pane-workshop');
      await expect(workshop).toHaveCSS('background-color', 'rgb(17, 34, 51)');
      const collaboration = page.locator('.mosaic-window.pane-collaboration');
      await expect(collaboration).not.toHaveCSS('background-color', 'rgb(17, 34, 51)');
      await page.screenshot({ path: 'e2e/.results/mood-2-workspace.png' });

      // Restart the app on the same garden: the theme comes back
      await app.close();
      const again = await launchApp({ dir });
      try {
        await again.page.getByRole('button', { name: /enter/i }).click();
        await expect(again.page.getByRole('button', { name: 'Add Crux' })).toBeVisible({
          timeout: 30_000,
        });
        const v = await again.page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--pane-gap').trim(),
        );
        expect(v).toBe('0px');
      } finally {
        await again.app.close();
      }
    } finally {
      await app.close().catch(() => {});
    }
  });
});
