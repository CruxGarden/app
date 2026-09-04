import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** Opt-in: CRUX_PRESET="Blade Runner" CRUX_SURVEY=1 → screenshots of a preset worn by the app. */
test.describe('preset screenshots', () => {
  test.skip(!process.env.CRUX_SURVEY || !process.env.CRUX_PRESET, 'opt-in');
  test.setTimeout(240_000);

  test('pick a preset and wear it', async () => {
    const name = process.env.CRUX_PRESET!;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const { app, page } = await launchApp();
    const shot = (n: string) => page.screenshot({ path: `e2e/.results/preset-${slug}-${n}.png` });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
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
        '<body style="margin:0;background:#04050d;color:#ff6a1a;font-family:monospace"><main style="padding:48px"><h1 style="font-size:56px;letter-spacing:.2em">TYRELL</h1><p style="color:#16d5e8">More human than human.</p></main></body>',
      );
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await page
        .getByRole('button', { name: /snapshot/i })
        .first()
        .click();
      const label = page.getByPlaceholder('Label (optional)');
      await label.fill('cells interlinked');
      await label.press('Enter');
      await expect(page.getByText('cells interlinked', { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(400);
      await shot('1-mood');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Toggle share' }).click();
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Do you like our owl?');
      await page.waitForTimeout(800);
      await shot('2-workspace');
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await shot('3-home');
    } finally {
      await app.close();
    }
  });
});
