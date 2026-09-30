import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** Desktop shows the draggable banner; its player controls belong to the website. */
test.describe('gateway layout', () => {
  test('desktop has no player; banner drag, reset and relaunch still work', async () => {
    const { app, page, dir } = await launchApp();
    const box = (id: string) => page.getByTestId(id).boundingBox();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      // Arrival: background first, then the title fades in on its own
      const stage = page.getByTestId('gateway-stage');
      await expect(stage).toHaveAttribute('data-visible', 'true', { timeout: 5_000 });
      await page.waitForTimeout(2300); // the entrance finishes before we measure
      await expect(page.getByTestId('gateway-player')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // The entry shares the site's type, with gray copy so the mint mark leads.
      await expect(page.locator('.teaser-title')).toHaveCSS('font-family', /Cormorant Garamond/);
      await expect(page.locator('.teaser-title')).toHaveCSS('font-weight', '500');
      await expect(page.locator('.teaser-line')).toHaveCSS('font-family', /Outfit/);
      await expect(page.locator('.teaser-line')).toHaveCSS('color', 'rgb(184, 184, 184)');
      await expect(page.getByRole('button', { name: 'Enter' })).toHaveCSS(
        'color',
        'rgb(159, 243, 228)',
      );
      await expect(page.locator('input[type="email"], .teaser-track')).toHaveCount(0);
      // The workspace material is dormant while the entry material is visible.
      await expect(page.locator('canvas.plasma-ground')).toHaveCount(0);
      await expect(page.locator('.gateway canvas')).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: 'Enter' }).locator('[data-icon="plusCircle"]'),
      ).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/gateway-teaser.png' });
      const before = (await box('gateway-banner'))!;
      // drag by the panel's top edge (not the button)
      await page.mouse.move(before.x + before.width / 2, before.y + 12);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 - 200, before.y + 12 + 120, { steps: 8 });
      await page.mouse.up();
      const after = (await box('gateway-banner'))!;
      expect(Math.round(after.x - before.x)).toBeLessThan(-100); // clamped at the window edge in a small test window
      expect(Math.round(after.y - before.y)).toBeGreaterThan(90);
      // the button still works after a drag
      await expect(page.getByRole('button', { name: 'Enter' })).toBeEnabled();
      // double-click puts the banner back
      const placedBanner = page.getByTestId('gateway-banner');
      await expect(placedBanner).toHaveAttribute('data-placed', 'true');
      const pb = (await placedBanner.boundingBox())!;
      await page.mouse.dblclick(pb.x + pb.width / 2, pb.y + 12);
      await expect(placedBanner).not.toHaveAttribute('data-placed', 'true');
    } finally {
      await app.close();
    }

    const again = await launchApp({ dir });
    try {
      await expect(again.page.getByRole('button', { name: 'Enter' })).toBeVisible({
        timeout: 30_000,
      });
      // The banner starts in place and the player remains absent.
      await expect(again.page.getByTestId('gateway-banner')).not.toHaveAttribute(
        'data-placed',
        'true',
      );
      await expect(again.page.getByTestId('gateway-player')).toHaveCount(0);
    } finally {
      await again.app.close();
    }
  });
});
