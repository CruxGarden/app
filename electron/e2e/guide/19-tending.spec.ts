import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 19 · Tending and alerts — search and the filters.
 * TEND-01/03/04/06/07/08 are in tending-demo, glasshouse, alerts and
 * journeys/04; TEND-05 needs a resolvable request (glasshouse-full-journey).
 */
test.describe('guide 19 · Tending', () => {
  test('TEND-02 — search narrows the list, the filter changes it, clearing restores it, a result opens its Crux', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Fern notes');
      await createCrux(page, 'Moss study');
      await goHome(page);
      const tending = await showPane(page, 'Tending');
      // Quiet Cruxes are not "current work": All shows them.
      const filter = tending.getByLabel('Show tasks');
      await filter.selectOption('all');
      // Each Crux is a group named after it; its Main lane has the Open button.
      const group = (title: string) => tending.getByRole('region', { name: title, exact: true });
      await expect(group('Fern notes')).toBeVisible();
      await expect(group('Moss study')).toBeVisible();
      const search = tending.getByLabel('Search Tending');
      await search.fill('moss');
      await expect(group('Moss study')).toBeVisible();
      await expect(group('Fern notes')).toHaveCount(0);
      await search.fill('nothing like this');
      await expect(tending.getByRole('button', { name: /^Open / })).toHaveCount(0);
      await search.fill('');
      await expect(group('Fern notes')).toBeVisible();
      // The filter: nothing needs tending in a quiet garden; All shows both.
      await filter.selectOption('attention');
      await expect(tending.getByRole('button', { name: /^Open / })).toHaveCount(0);
      await filter.selectOption('all');
      await expect(group('Moss study')).toBeVisible();
      // A result opens the right Crux.
      await group('Moss study').getByRole('button', { name: /^Open / }).first().click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Moss study',
      );
    } finally {
      await app.close();
    }
  });

  test('TEND-08 — Tending opens as a pane from Home, from inside a Crux, from a timer chip and from an alert', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      // From Home: the top-bar link.
      await page.locator('header').getByRole('button', { name: 'Tending', exact: true }).click();
      await expect(page.getByTestId('pane-body-tending')).toBeVisible();
      await expect(page.locator('.mosaic-window.pane-tending')).toBeVisible();
      // A timer makes a chip; an alert rings the bell. Both lead here.
      const section = page.getByTestId('schedules');
      await section.getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('Title', { exact: true }).fill('Focus');
      await page.getByLabel('When', { exact: true }).selectOption('timer');
      await page.getByLabel('Alert note 1').fill('Break time.');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await section.getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page.getByTestId('timer-chip').first()).toBeVisible({ timeout: 30_000 });
      await page.locator('.mosaic-window.pane-tending .pane-toolbar-close').click();
      await expect(page.getByTestId('pane-body-tending')).toHaveCount(0);
      await page.getByTestId('timer-chip').first().getByRole('button').first().click();
      await expect(page.getByTestId('pane-body-tending')).toBeVisible({ timeout: 30_000 });
      await page.locator('.mosaic-window.pane-tending .pane-toolbar-close').click();
      // Inside a Crux: the same link, the same pane, beside the work.
      await createCrux(page, 'Inside');
      await page.locator('header').getByRole('button', { name: 'Tending', exact: true }).click();
      await expect(page.getByTestId('pane-body-tending')).toBeVisible();
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible();
      // It lists Cruxes, never Gardens or Moods.
      const tending = page.getByTestId('pane-body-tending');
      await tending.getByLabel('Show tasks').selectOption('all');
      await expect(tending.getByRole('region', { name: 'Inside', exact: true })).toBeVisible();
      await expect(tending.getByRole('region', { name: 'My Garden', exact: true })).toHaveCount(0);
      await expect(tending.getByRole('region', { name: /Digital Fractal Garden/ })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
