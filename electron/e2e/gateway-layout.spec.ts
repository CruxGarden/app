import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** The Gateway's banner and player go where you drag them — for the session; a relaunch starts in place. */
test.describe('gateway layout', () => {
  test('drag the banner and the player; double-click resets; a relaunch starts in place', async () => {
    const { app, page, dir } = await launchApp();
    const box = (id: string) => page.getByTestId(id).boundingBox();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      // Arrival: background first, then the title fades in on its own within a second or so
      const stage = page.getByTestId('gateway-stage');
      await expect(stage).toHaveAttribute('data-visible', 'true', { timeout: 5_000 });
      await page.waitForTimeout(1600); // the fade finishes before we measure
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
      // the player is anchored to the banner: its centre moved by the same amount as the banner's
      // (a placed banner is no longer full-width, so compare centres, not left edges)
      const cx = (b: { x: number; width: number }) => b.x + b.width / 2;
      const cy = (b: { y: number; height: number }) => b.y + b.height / 2;
      const barFollowed = (await box('gateway-player'))!;
      expect(Math.round(cx(barFollowed) - cx(barAfter))).toBe(Math.round(cx(after) - cx(before)));
      expect(Math.round(cy(barFollowed) - cy(barAfter))).toBe(Math.round(cy(after) - cy(before)));

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
      // nothing was remembered: both pieces are back in the flow
      await expect(again.page.getByTestId('gateway-banner')).not.toHaveAttribute(
        'data-placed',
        'true',
      );
      await expect(again.page.getByTestId('gateway-player')).not.toHaveAttribute(
        'data-placed',
        'true',
      );
    } finally {
      await again.app.close();
    }
  });
});
