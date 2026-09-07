import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** The Gateway's banner and player go where you drag them, and stay there. */
test.describe('gateway layout', () => {
  test('drag the banner and the player; the place survives a relaunch; double-click resets', async () => {
    const { app, page, dir } = await launchApp();
    const box = (id: string) => page.getByTestId(id).boundingBox();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      // Arrival: the stage waits for the person to stir
      const stage = page.getByTestId('gateway-stage');
      await expect(stage).toHaveAttribute('data-visible', 'false');
      await page.mouse.move(40, 40);
      await expect(stage).toHaveAttribute('data-visible', 'true');
      await page.waitForTimeout(1300); // the rise finishes before we measure
      // the player sits directly under the banner, both centred
      const b0 = (await box('gateway-banner'))!;
      const p0 = (await box('gateway-player'))!;
      expect(p0.y).toBeGreaterThan(b0.y + b0.height - 1);
      expect(Math.abs(p0.x + p0.width / 2 - (b0.x + b0.width / 2))).toBeLessThan(4);
      const barBefore = (await box('gateway-player'))!;
      const grip = (await box('gateway-player-grip'))!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x - 300, grip.y - 200, { steps: 8 }); // up: there is room above
      await page.mouse.up();
      const barAfter = (await box('gateway-player'))!;
      expect(barBefore.y - barAfter.y).toBeGreaterThan(150);
      const before = (await box('gateway-banner'))!; // re-measured: the column re-centred once the player left it
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
