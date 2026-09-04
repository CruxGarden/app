import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Visual survey (not an assertion suite): walks the home page and the small
 * workspace panes and leaves screenshots in e2e/.results/survey-*.png.
 */
test.describe('ui survey', () => {
  test.setTimeout(240_000);

  test.skip(
    !process.env.CRUX_SURVEY,
    'opt-in: CRUX_SURVEY=1 npx playwright test e2e/survey.spec.ts',
  );

  test('home + panes', async () => {
    const { app, page } = await launchApp();
    const shot = (name: string) => page.screenshot({ path: `e2e/.results/survey-${name}.png` });
    const goHome = async () => {
      // The breadcrumb's first button is the garden name → /home
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible({ timeout: 30_000 });
    };
    const createBlank = async (title?: string) => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      if (title) {
        const t = page.getByRole('textbox', { name: /name/i });
        await t.fill(title);
      }
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
    };
    const togglePane = async (p: Page, name: RegExp) => {
      await p.getByRole('button', { name }).click();
    };

    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible({ timeout: 30_000 });
      await shot('home-empty');

      // Crux 1: a file + a snapshot (captures preview.jpg on desktop)
      await createBlank();
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type(
        '<body style="margin:0;font-family:sans-serif;background:#0f1412;color:#dfe6e2"><main style="padding:48px"><h1 style="font-size:40px">Hello, garden</h1><p>A small page grown in Crux Garden.</p></main></body>',
      );
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(2500);
      await togglePane(page, /^Toggle history$/i);
      await page
        .getByRole('button', { name: /snapshot/i })
        .first()
        .click();
      const label = page.getByPlaceholder('Label (optional)');
      await label.fill('first light');
      await label.press('Enter');
      await expect(page.getByText('first light', { exact: true })).toBeVisible({ timeout: 30_000 });
      await togglePane(page, /^Toggle history$/i);
      await shot('workspace');

      // Panes
      for (const pane of ['share', 'sync', 'export', 'store', 'metadata']) {
        const re = new RegExp(`^Toggle ${pane}$`, 'i');
        await togglePane(page, re);
        await page.waitForTimeout(600);
        await shot(`pane-${pane}`);
        await togglePane(page, re);
      }

      // Crux 2: placeholder card
      await goHome();
      await createBlank('Field notes');
      await goHome();
      await page.waitForTimeout(800);
      await shot('home');
    } finally {
      await app.close();
    }
  });
});
