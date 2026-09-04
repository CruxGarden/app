import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * UI parity for set_background: the Background tab can make a backdrop from a
 * description without the agent. With no image-capable key configured the
 * control explains why instead of failing silently.
 */
test.describe('background: describe a backdrop (UI)', () => {
  test('the Generate control exists and reports a missing key clearly', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await expect(page.getByRole('heading', { name: 'Mood Builder' })).toBeVisible();
      await page.getByRole('button', { name: 'Background', exact: true }).first().click();
      const box = page.getByRole('textbox', { name: 'Backdrop description' });
      await expect(box).toBeVisible();
      const generate = page.getByRole('button', { name: 'Generate', exact: true });
      await expect(generate).toBeDisabled();
      await box.fill('fog over a pine forest at dawn');
      await expect(generate).toBeEnabled();
      await generate.click();
      // No provider key in the test garden → a readable error, not a spinner forever
      await expect(page.getByText(/key|provider|image/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(generate).toBeEnabled({ timeout: 20_000 });
    } finally {
      await app.close();
    }
  });
});
