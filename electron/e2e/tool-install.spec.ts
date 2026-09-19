import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * A build carries only its bundled Crux Tools (ADR 0050). The picker still
 * lists every tool it knows from its manifest; one that is not in the build
 * says so, and offers Install from a .crux package instead of Create. A
 * bundled tool creates as before. Runs against whatever the current build
 * is: it reads which is which from the picker rather than assuming.
 */
test('the picker tells a bundled tool from one to install', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    const rows = page.locator('button', { hasText: 'not in this build' });
    const missing = await rows.count();
    const hextris = page.getByRole('button', { name: /^Hextris/ });
    await expect(hextris).toBeVisible();
    await expect(hextris).not.toContainText('not in this build');

    if (missing > 0) {
      await rows.first().click();
      await expect(page.getByTestId('tool-not-bundled')).toContainText(
        'not included in this build',
      );
      await expect(page.getByRole('button', { name: 'Install from .crux…' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create', exact: true })).toHaveCount(0);
    }

    await hextris.click();
    await expect(page.getByTestId('tool-not-bundled')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Hextris',
    );
    console.log(`tools not in this build: ${missing}`);
  } finally {
    await app.close();
  }
});
