import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** Error states must render a way back, never a blank page. */
test.describe('error states', () => {
  test('a stale crux link says it is gone, with a way home', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();

      // A stale deep link: full load straight into a crux id this garden lacks
      // (also exercises the deep-link boot path, not just the Gateway).
      await page.goto('crux-app://index.html/c/00000000-0000-4000-8000-000000000000');
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(/no longer available/i);
      await page.screenshot({ path: 'e2e/.results/errors-1-not-found.png' });
      await alert.getByRole('button', { name: 'Open My Garden', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
