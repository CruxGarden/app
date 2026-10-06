import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';
import { newGarden } from './journey-helpers';

/** The Navigator's Graph view draws the same Gardens and Cruxes the Tree lists, and opens them. */
test('the Navigator graph view maps the Gardens and opens a Crux', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await newGarden(page, 'Studio');
    await createCrux(page, 'Poster');
    const nav = await showPane(page, 'Navigator');
    await nav.getByRole('combobox', { name: 'Navigation view' }).selectOption('graph');
    const graph = nav.getByRole('region', { name: 'Graph', exact: true });
    await expect(graph.locator('canvas')).toBeVisible();
    // Every node is reachable without the canvas too.
    await expect(graph.getByRole('button', { name: 'My Garden', exact: true })).toBeAttached();
    await expect(graph.getByRole('button', { name: 'Poster', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.waitForTimeout(1500); // let the layout settle for the picture
    await page.screenshot({ path: 'e2e/.results/navigator-graph.png' });
    await graph.getByRole('button', { name: 'My Garden', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'My Garden',
    );
    await expect(page.getByTestId('pane-body-home')).toBeVisible();
  } finally {
    await app.close();
  }
});
