import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Every dimension is a token: type scale, density, per-pane border width,
 * header label case, editor font size reach the rendered app; a look can be
 * saved as a preset (appears under Yours in the Mood modal) and undone.
 */
test.describe('theme dimensions', () => {
  test.setTimeout(150_000);

  test('type scale, density, header anatomy, saved preset, undo', async () => {
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({ timeout: 30_000 });
      const html = page.locator('html');
      await expect(html).toHaveCSS('font-size', '16px');
      const label = page.locator('.mosaic-window.pane-collaboration .pane-toolbar-label').first();
      await expect(label).toHaveCSS('text-transform', 'uppercase');

      // Mood → Builder → Theme
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await expect(page.getByRole('heading', { name: 'Mood Builder' })).toBeVisible();

      // Typography: scale 1.25 → root font 20px
      await page.getByRole('button', { name: 'Typography' }).click();
      const scale = page.getByRole('textbox', { name: 'Font scale value' });
      await scale.fill('1.25');
      await scale.press('Enter');
      await expect(html).toHaveCSS('font-size', '20px');

      // Density 1.5 → Tailwind spacing unit follows
      await page.getByRole('button', { name: 'Shape & layout' }).click();
      const density = page.getByRole('textbox', { name: 'Density value' });
      await density.fill('1.5');
      await density.press('Enter');
      await expect.poll(() => cssVar('--density')).toBe('1.5');

      // Pane headers: label case none
      await page.getByRole('button', { name: 'Pane headers' }).click();
      const labelCase = page.getByRole('textbox', { name: 'Pane header label case value' });
      await labelCase.fill('none');
      await labelCase.press('Enter');
      await expect.poll(() => cssVar('--pane-header-label-case')).toBe('none');

      // Collaboration pane: its own 6px frame
      await page.getByRole('button', { name: 'Collaboration pane' }).click();
      const bw = page.getByRole('textbox', { name: 'Border width value' });
      await bw.fill('6px');
      await bw.press('Enter');
      await expect.poll(() => cssVar('--pane-collaboration-border-width')).toBe('6px');

      // Undo the last edit, redo it
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect.poll(() => cssVar('--pane-collaboration-border-width')).toBe('1px');
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect.poll(() => cssVar('--pane-collaboration-border-width')).toBe('6px');

      // Save the look as a preset
      await page.getByRole('button', { name: 'Save as preset' }).click();
      await page.getByRole('textbox', { name: 'Preset name' }).fill('Big & Loud');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Saved "Big & Loud"');
      await expect(page.getByText(/\b0 custom\b/)).toHaveCount(0);
      await page.screenshot({ path: 'e2e/.results/dimensions-1-theme-tab.png' });

      // Back in the workspace everything holds
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({ timeout: 30_000 });
      await expect(html).toHaveCSS('font-size', '20px');
      await expect(label).toHaveCSS('text-transform', 'none');
      await expect(page.locator('.mosaic-window.pane-collaboration')).toHaveCSS(
        'padding-left',
        '6px',
      );
      await expect(page.locator('.mosaic-window.pane-workshop')).toHaveCSS('padding-left', '1px');
      await page.screenshot({ path: 'e2e/.results/dimensions-2-workspace.png' });

      // The preset is in the Mood modal under Yours and is the active one
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await expect(page.getByText('Yours', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Big & Loud', exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/dimensions-3-yours.png' });
    } finally {
      await app.close();
    }
  });
});
