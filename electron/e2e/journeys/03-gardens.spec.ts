import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { newGarden, goToGarden } from './journey-helpers';

/** Gardens inside Gardens: a Crux lives in one place; Home and the Navigator agree; it all survives a restart. */
test('nested Gardens hold Cruxes and come back after a restart', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    let page = instance.page;
    await enterGarden(page);
    await newGarden(page, 'Studio');
    await createCrux(page, 'Poster');
    await goHome(page);
    await expect(page.getByRole('button', { name: 'Open Poster', exact: true })).toBeVisible();
    await goToGarden(page, 'My Garden');
    await expect(page.getByRole('button', { name: 'Open Studio', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Poster', exact: true })).toHaveCount(0);

    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByRole('button', { name: 'Open Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Open Poster', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Poster',
    );
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
  } finally {
    await instance.app.close();
  }
});
