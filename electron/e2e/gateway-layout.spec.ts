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
