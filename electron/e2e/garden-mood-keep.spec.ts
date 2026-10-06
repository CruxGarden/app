import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { showPane } from './panel-helpers';
import { enterGarden, openFullThemeBuilder } from './multi-crux-helpers';

const html = (page: Page) => page.locator('html');
async function goToMyGarden(page: Page) {
  await page.getByRole('button', { name: 'Garden location', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Garden ancestry' })
    .getByRole('button', { name: 'My Garden', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
    'My Garden',
  );
}

test('a look changed in a Garden is kept for it only when asked', async () => {
  test.setTimeout(150_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    await expect(html(page)).toHaveClass(/\bdark\b/);

    // Change the look here: the Mood pane offers to keep it.
    const mood = await showPane(page, 'Mood');
    await openFullThemeBuilder(page);
    await mood.getByRole('button', { name: 'Ivory' }).click();
    await expect(html(page)).toHaveClass(/\blight\b/);
    const keep = mood.getByRole('button', { name: 'Keep for Studio', exact: true });
    await expect(keep).toBeVisible();

    // Not kept: leaving and coming back paints the Garden's Mood again.
    await goToMyGarden(page);
    await page.getByRole('button', { name: 'Open Studio' }).click();
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(keep).toHaveCount(0);

    // Kept: it becomes Studio's own Mood and returns with Studio.
    await openFullThemeBuilder(page);
    await mood.getByRole('button', { name: 'Ivory' }).click();
    await keep.click();
    await expect(keep).toHaveCount(0);
    await mood.getByRole('button', { name: 'Moods', exact: true }).click();
    await expect(mood.getByRole('region', { name: 'Garden Mood' })).toContainText('· Studio');
    await goToMyGarden(page);
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await page.getByRole('button', { name: 'Open Studio' }).click();
    await expect(html(page)).toHaveClass(/\blight\b/);
    await page.screenshot({ path: 'e2e/.results/garden-mood-keep.png' });
  } finally {
    await app.close();
  }
});
