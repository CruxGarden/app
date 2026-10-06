import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Back and Forward follow visited Garden and Crux routes, not containment', async () => {
  test.setTimeout(90_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Music');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    const project = await createCrux(page, 'Dream study');
    const projectUrl = page.url();
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'My Garden', exact: true })
      .click();
    const rootUrl = page.url();
    const back = page.getByRole('button', { name: 'Back', exact: true });
    const forward = page.getByRole('button', { name: 'Forward', exact: true });
    await expect(back).toBeVisible({ timeout: 3_000 });
    await expect(forward).toBeDisabled();
    await back.click();
    await expect(page).toHaveURL(projectUrl);
    await expect(page.locator(`[data-workspace-id="${project}"]`)).toBeVisible();
    await expect(forward).toBeEnabled();
    // Availability survives renderer reload because the browser owns the stack.
    await page.reload();
    await expect(page).toHaveURL(projectUrl);
    await expect(page.locator(`[data-workspace-id="${project}"]`)).toBeVisible();
    await expect(forward).toBeEnabled();
    await forward.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(rootUrl);
    await expect(forward).toBeDisabled();
    // Native history traversal updates exactly the same controls.
    await page.goBack();
    await expect(page).toHaveURL(projectUrl);
    await expect(forward).toBeEnabled();
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'Close crux', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Open Dream study', exact: true })).toBeVisible();
    await expect(forward).toBeDisabled();
    await back.click();
    await expect(page).toHaveURL(projectUrl);
    await expect(forward).toBeEnabled();
    await page.setViewportSize({ width: 480, height: 720 });
    await expect(back).toBeInViewport();
    await expect(forward).toBeInViewport();
    await page.screenshot({ path: 'e2e/.results/garden-history-narrow.png' });
    await app.close();
    const restarted = await launchApp({ dir });
    try {
      await restarted.page.getByRole('button', { name: /enter/i }).click();
      await expect(
        restarted.page.getByRole('button', { name: 'Open Music', exact: true }),
      ).toBeVisible();
      await expect(
        restarted.page.getByRole('button', { name: 'Forward', exact: true }),
      ).toBeDisabled();
    } finally {
      await restarted.app.close();
    }
  } finally {
    await app.close().catch(() => {});
  }
});
