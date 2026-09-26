import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';
import { newGarden, goToGarden } from './journey-helpers';

/** A Garden wears a Mood; a child inherits until it chooses; edits are kept only when asked. */
test('Moods belong to Gardens', async () => {
  test.setTimeout(150_000);
  const { app, page } = await launchApp();
  const html = page.locator('html');
  try {
    await enterGarden(page);
    await newGarden(page, 'Studio');
    const mood = await showPane(page, 'Mood');
    await expect(mood.getByRole('region', { name: 'Garden Mood' })).toContainText(
      'Studio wears the Default Mood',
    );
    await mood.getByRole('button', { name: 'Theme', exact: true }).click();
    await mood.getByRole('button', { name: 'Ivory' }).click();
    await expect(html).toHaveClass(/\blight\b/);
    await mood.getByRole('button', { name: 'Keep for Studio', exact: true }).click();
    await goToGarden(page, 'My Garden');
    await expect(html).toHaveClass(/\bdark\b/);
    await goToGarden(page, 'Studio');
    await expect(html).toHaveClass(/\blight\b/);
  } finally {
    await app.close();
  }
});
