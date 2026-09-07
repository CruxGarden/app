import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** The Gateway's banner and player go where you drag them, and stay there. */
test.describe('gateway layout', () => {
  test('drag the banner and the player; the place survives a relaunch; double-click resets', async () => {
    const { app, page, dir } = await launchApp();
    const box = (id: string) => page.getByTestId(id).boundingBox();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      const before = (await box('gateway-banner'))!;
      // drag by the panel's top edge (not the button)
      await page.mouse.move(before.x + before.width / 2, before.y + 12);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 - 200, before.y + 12 + 120, { steps: 8 });
      await page.mouse.up();
      const after = (await box('gateway-banner'))!;
      expect(Math.round(after.x - before.x)).toBeLessThan(-100); // clamped at the window edge in a small test window
      expect(Math.round(after.y - before.y)).toBeGreaterThan(90);

      const barBefore = (await box('gateway-player'))!;
      await page.mouse.move(barBefore.x + 4, barBefore.y + barBefore.height / 2);
      await page.mouse.down();
      await page.mouse.move(barBefore.x + 4 - 300, barBefore.y + 200, { steps: 8 });
      await page.mouse.up();
      const barAfter = (await box('gateway-player'))!;
      expect(barAfter.y - barBefore.y).toBeGreaterThan(150);
      // the button still works after a drag
      await expect(page.getByRole('button', { name: 'Enter' })).toBeEnabled();
    } finally {
      await app.close();
    }

    const again = await launchApp({ dir });
    try {
      await expect(again.page.getByRole('button', { name: 'Enter' })).toBeVisible({
        timeout: 30_000,
      });
      const banner = again.page.getByTestId('gateway-banner');
      await expect(banner).toHaveAttribute('data-placed', 'true');
      const b = (await banner.boundingBox())!;
      await again.page.mouse.dblclick(b.x + b.width / 2, b.y + 12);
      await expect(banner).not.toHaveAttribute('data-placed', 'true');
    } finally {
      await again.app.close();
    }
  });
});
