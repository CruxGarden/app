import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';

/**
 * V1-TESTING-GUIDE § 01 · Gateway and first garden. One test per checklist
 * row that automation can judge; the row ID is the test title.
 * START-03 lives in gateway-layout.spec.ts, START-06 in garden-panes.spec.ts.
 */
test.describe('guide 01 · Gateway and first garden', () => {
  test('START-01 — an empty profile enters the garden after a resize, without signing in', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await page.setViewportSize({ width: 900, height: 640 });
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();
      await page.setViewportSize({ width: 1400, height: 900 });
      await enterGarden(page);
      // Home, not a blank page and not the welcome again.
      await expect(page.getByTestId('pane-body-home')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enter' })).toHaveCount(0);
      await expect(page.getByPlaceholder('email@example.com')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('START-02 — the planted garden survives a relaunch and is not planted twice', async () => {
    const first = await launchApp();
    let dir = first.dir;
    try {
      await expect(first.page.getByRole('button', { name: 'Enter' })).toBeVisible({
        timeout: 30_000,
      });
      await enterGarden(first.page);
      await createCrux(first.page, 'Planted');
    } finally {
      await first.app.close();
    }
    const again = await launchApp({ dir });
    try {
      // Enter again lands on Home: no second plant, the Crux still there, one Garden.
      await again.page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await expect(again.page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      await expect(again.page.getByText('Plant a new garden')).toHaveCount(0);
      await expect(again.page.getByRole('button', { name: 'Open Planted' })).toBeVisible();
      const gardens = await again.page.evaluate(async () => {
        const rows = (await window.electronAPI!.sqlite.all(
          "SELECT id FROM cruxes WHERE kind = 'garden' AND deleted IS NULL",
        )) as { id: string }[];
        return rows.length;
      });
      expect(gardens).toBe(1);
      dir = again.dir;
    } finally {
      await again.app.close();
    }
  });

  test('START-04 — undertakings are one click away; cancelling leaves no Garden; Just a Crux makes a Blank one', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Explore undertakings' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add Crux' });
      await expect(dialog).toBeVisible();
      // Six choices, each named and described.
      const choices = dialog.locator('[data-undertaking-id]');
      await expect(choices).toHaveCount(6);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const gardens = await page.evaluate(async () => {
        const rows = (await window.electronAPI!.sqlite.all(
          "SELECT id FROM cruxes WHERE kind = 'garden' AND deleted IS NULL",
        )) as { id: string }[];
        return rows.length;
      });
      expect(gardens).toBe(1); // only the root
      await page.getByRole('button', { name: 'Just a Crux' }).click();
      await expect(page.getByRole('dialog', { name: 'Add Crux' })).toBeVisible();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByPlaceholder('My Crux').fill('Just this');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Just this',
      );
    } finally {
      await app.close();
    }
  });

  test('START-05 — at a narrow width the welcome works from the keyboard alone', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await page.setViewportSize({ width: 820, height: 620 });
      await page.waitForTimeout(2500); // the entrance settles before focus moves
      // Tab reaches Enter; Enter opens the choices; Tab + Enter plants; Welcome continues.
      for (let i = 0; i < 8; i++) {
        if (
          await page
            .getByRole('button', { name: 'Enter' })
            .evaluate((b) => b === document.activeElement)
        )
          break;
        await page.keyboard.press('Tab');
      }
      await expect(page.getByRole('button', { name: 'Enter' })).toBeFocused();
      await page.keyboard.press('Enter');
      const plant = page.getByRole('button', { name: /Plant a new garden/ });
      await expect(plant).toBeVisible();
      for (let i = 0; i < 8; i++) {
        if (await plant.evaluate((b) => b === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(plant).toBeFocused();
      await page.keyboard.press('Enter');
      const welcome = page.getByRole('button', { name: 'Welcome' });
      await expect(welcome).toBeVisible();
      const box = (await welcome.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(820);
      await welcome.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
