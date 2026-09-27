import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * The Glasshouse demo Crux is created from Tending without a provider key,
 * and Tending counts its Tasks: two "Ready to review", none "Working", four
 * "Not checked". Everything after that (export, review and merge, the Growth
 * graph, import into a fresh garden, publish) is glasshouse-full-journey.spec.ts.
 */
test('Glasshouse is created without a key and Tending counts its Tasks', async () => {
  test.setTimeout(120000);
  const { app, page } = await launchApp();
  page.setDefaultTimeout(15000);
  try {
    await enterGarden(page);
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^Tending/ })
      .click();
    await page.getByRole('button', { name: 'Create demo Crux', exact: true }).click();
    await expect(page.getByText('Glasshouse is ready.', { exact: false })).toBeVisible({
      timeout: 60000,
    });
    const group = page.getByRole('region', { name: 'Glasshouse · Tending demo', exact: true });
    await expect(group.getByText('Ready to review', { exact: true })).toHaveCount(2);
    await expect(group.getByText('Working', { exact: true })).toHaveCount(0);
    await expect(group.getByText('Not checked', { exact: true })).toHaveCount(4);
    await page.screenshot({ path: '/private/tmp/glasshouse-tending.png', fullPage: true });
  } finally {
    await app.close();
  }
});
