import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * "Ship the single user first" (Daniel, 2026-09-21): a v1 build never shows
 * the v2 pieces. Without CRUX_V2 the picker has no Garden template and Home
 * has no Gardens section; with it, the Garden is offered.
 */
test('a v1 launch hides the v2 pieces; CRUX_V2=1 shows them', async () => {
  const v1 = await launchApp();
  try {
    await enterGarden(v1.page);
    await expect(v1.page.getByTestId('gardens-section')).toHaveCount(0);
    await v1.page.getByRole('button', { name: 'Add Crux' }).click();
    await expect(v1.page.getByRole('button', { name: /^Order Desk/ })).toBeVisible();
    await expect(v1.page.getByRole('button', { name: /^Garden/ })).toHaveCount(0);
  } finally {
    await v1.app.close();
  }
  const v2 = await launchApp({ env: { CRUX_V2: '1' } });
  try {
    await enterGarden(v2.page);
    await v2.page.getByRole('button', { name: 'Add Crux' }).click();
    await expect(v2.page.getByRole('button', { name: /^Garden/ })).toBeVisible();
  } finally {
    await v2.app.close();
  }
});
