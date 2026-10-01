import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, openFullThemeBuilder } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

test('Mood transparency controls reach rendered color alpha and persist, with accessible search reset', async () => {
  const { app, page, dir } = await launchApp({ ai: false });
  const alpha = () =>
    page.getByRole('textbox', { name: 'Search Cruxes', exact: true }).evaluate((input) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = getComputedStyle(input).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    });
  try {
    await enterGarden(page);
    const mood = await showPane(page, 'Mood');
    await mood.getByRole('button', { name: 'Theme', exact: true }).click();
    await mood
      .getByRole('combobox', { name: 'Surface', exact: true })
      .selectOption({ label: 'Solid' });
    await openFullThemeBuilder(page);
    const search = mood.getByRole('searchbox', { name: 'Find a token' });
    await expect.poll(alpha).toBe(128);
    await search.fill('tintBalanced');
    const tint = mood.getByRole('textbox', { name: 'Tint balanced value', exact: true });
    await tint.fill('0%');
    await tint.press('Enter');
    await expect.poll(alpha).toBe(0);
    await tint.fill('100%');
    await tint.press('Enter');
    await expect.poll(alpha).toBe(255);
    const gardenSearch = page.getByRole('textbox', { name: 'Search Cruxes', exact: true });
    await gardenSearch.fill('A search');
    await page.getByRole('button', { name: 'Clear Crux search', exact: true }).click();
    await expect(gardenSearch).toHaveValue('');
  } finally {
    await app.close();
  }
  const again = await launchApp({ dir, ai: false });
  try {
    await again.page.getByRole('button', { name: /enter/i }).click();
    await expect
      .poll(() =>
        again.page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--tint-balanced').trim(),
        ),
      )
      .toBe('100%');
  } finally {
    await again.app.close();
  }
});
