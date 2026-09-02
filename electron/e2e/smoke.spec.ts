import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test.describe('desktop smoke', () => {
  test('boots to the Gateway and enters a fresh garden', async () => {
    const { app, page } = await launchApp();
    try {
      // Gateway: wordmark + tagline
      await expect(page.getByRole('heading', { name: 'Crux Garden' })).toBeVisible();
      await expect(page.getByText('where ideas grow')).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/gateway.png' });

      // Enter → fresh install offers to plant a garden
      await page.getByRole('button', { name: /enter/i }).click();
      await expect(page.getByText(/plant/i).first()).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/after-enter.png' });
    } finally {
      await app.close();
    }
  });
});
