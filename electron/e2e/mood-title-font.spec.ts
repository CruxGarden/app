import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, wearMaterial } from './multi-crux-helpers';

test('pane and modal titles follow the Mood title font together', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Title study');
    const pane = page.locator('.pane-toolbar-label').filter({ hasText: 'Collaboration' });
    await expect(pane).toHaveCSS('font-family', /Cormorant Garamond/);
    await expect(pane).toHaveCSS('font-size', '18px');
    await expect(
      page.locator('.font-body').filter({ hasText: 'Everything here is one material.' }).last(),
    ).toHaveCSS('font-family', /Inter/);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const title = page.getByRole('heading', { name: 'Mood', exact: true });
    await expect(title).toHaveCSS('font-family', /Cormorant Garamond/);
    await wearMaterial(page, 'plasma-fjord');
    const titles = page.getByTestId('material-switch-titles');
    await titles.getByRole('button', { name: 'Mono', exact: true }).click();
    await expect(pane).toHaveCSS('font-family', /JetBrains Mono/);
    await expect(title).toHaveCSS('font-family', /JetBrains Mono/);
    await titles.getByRole('button', { name: 'Serif', exact: true }).click();
    await expect(pane).toHaveCSS('font-family', /Cormorant Garamond/);
    await expect(pane).toHaveCSS('font-size', '18px');
    await expect(title).toHaveCSS('font-family', /Cormorant Garamond/);
    await wearMaterial(page, 'fjord');
    await expect(pane).toHaveCSS('font-family', /Inter/);
    await expect(pane).toHaveCSS('font-size', '13px');
    await expect(title).toHaveCSS('font-family', /Inter/);
    await expect(page.locator('html')).toHaveCSS('--font-display', /Inter/);
    await page.screenshot({ path: 'e2e/.results/mood-title-font.png' });
  } finally {
    await app.close();
  }
});
