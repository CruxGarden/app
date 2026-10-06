import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';
import { newGarden, goToGarden } from './journey-helpers';

/** A schedule belongs to the Garden it was made in and travels with it. */
test('schedules are the Garden’s own', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await newGarden(page, 'Studio');
    const tending = await showPane(page, 'Tending');
    await tending.getByRole('button', { name: 'Schedule…' }).click();
    await tending.getByLabel('Title', { exact: true }).fill('Stretch');
    await tending.getByLabel('When', { exact: true }).selectOption('every');
    await tending.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(tending.getByTestId('schedule')).toHaveCount(1);
    await goToGarden(page, 'My Garden');
    await expect(page.getByTestId('pane-body-tending').getByTestId('schedule')).toHaveCount(0);
    await goToGarden(page, 'Studio');
    await expect(page.getByTestId('pane-body-tending').getByTestId('schedule')).toHaveCount(1);
  } finally {
    await app.close();
  }
});
