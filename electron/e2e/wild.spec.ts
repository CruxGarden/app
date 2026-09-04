import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Visual stress test (opt-in): import an intentionally outrageous theme through
 * the Mood Builder and screenshot the app wearing it. Not an assertion suite.
 */
test.describe('wild theme', () => {
  test.skip(!process.env.CRUX_SURVEY, 'opt-in: CRUX_SURVEY=1 npx playwright test e2e/wild.spec.ts');
  test.setTimeout(240_000);

  test('import and wear it', async () => {
    const { app, page } = await launchApp();
    const shot = (name: string) => page.screenshot({ path: `e2e/.results/wild-${name}.png` });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // A crux with a file and a snapshot so every pane has content
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type(
        '<body style="margin:0;background:#ff2d95;color:#000;font-family:sans-serif"><main style="padding:48px"><h1 style="font-size:64px">LOUD</h1><p>A page with no indoor voice.</p></main></body>',
      );
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await page
        .getByRole('button', { name: /snapshot/i })
        .first()
        .click();
      const label = page.getByPlaceholder('Label (optional)');
      await label.fill('too much');
      await label.press('Enter');
      await expect(page.getByText('too much', { exact: true })).toBeVisible({ timeout: 30_000 });

      // Mood modal → Mood Builder → Import the theme
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await expect(page.getByRole('heading', { name: 'Mood Builder' })).toBeVisible();
      await page
        .locator('input[type="file"][accept*="json"]')
        .setInputFiles(join(__dirname, 'fixtures', 'wild-theme.json'));
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--pane-gap').trim(),
          ),
        )
        .toBe('20px');
      await page.waitForTimeout(500);
      await shot('1-mood-builder');

      // Wear it
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('tree')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.waitForTimeout(800);
      await shot('2-workspace');
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await page.getByRole('button', { name: 'Toggle store' }).click();
      await page.waitForTimeout(800);
      await shot('3-workspace-more');

      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await shot('4-home');
    } finally {
      await app.close();
    }
  });
});
