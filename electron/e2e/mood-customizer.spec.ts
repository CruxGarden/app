import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

test('guided Customizer is the default and full editing preserves its choices', async () => {
  test.setTimeout(150_000);
  const { app, page, dir } = await launchApp({ ai: false });
  try {
    await page.setViewportSize({ width: 1400, height: 950 });
    await enterGarden(page);
    const mood = await showPane(page, 'Mood');
    await mood.getByRole('button', { name: 'Theme', exact: true }).click();
    await expect(
      mood.getByRole('heading', { name: 'Theme Customizer', exact: true }),
    ).toBeVisible();
    await expect(mood.getByRole('searchbox', { name: 'Find a token' })).toHaveCount(0);
    await mood
      .getByRole('combobox', { name: 'Surface', exact: true })
      .selectOption({ label: 'Solid' });
    await mood
      .getByRole('combobox', { name: 'Typeface', exact: true })
      .selectOption({ label: 'Bookish' });
    await mood
      .getByRole('combobox', { name: 'Corners', exact: true })
      .selectOption({ label: 'Square' });
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
      'border-radius',
      '0px',
    );
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
      'font-family',
      'Georgia, serif',
    );
    await page.screenshot({ path: '../docs/expedition-moods/customizer.png' });
    await mood.getByRole('button', { name: 'Full Theme Builder', exact: true }).click();
    const search = mood.getByRole('searchbox', { name: 'Find a token' });
    await search.fill('fontDisplay');
    const font = mood.getByRole('textbox', { name: 'Font display value', exact: true });
    await expect(font).toHaveValue('Georgia, serif');
    await font.fill('monospace');
    await font.press('Enter');
    await search.fill('secondaryActionOpacity');
    const opacity = mood.getByRole('textbox', {
      name: 'Secondary action opacity value',
      exact: true,
    });
    await opacity.fill('0.85');
    await opacity.press('Enter');
    await mood.getByRole('button', { name: 'Back to Customizer', exact: true }).click();
    await mood
      .getByRole('combobox', { name: 'Spacing', exact: true })
      .selectOption({ label: 'Roomy' });
    const values = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return {
          font: s.getPropertyValue('--font-display').trim(),
          opacity: s.getPropertyValue('--secondary-action-opacity').trim(),
          gap: s.getPropertyValue('--pane-gap').trim(),
        };
      });
    await expect.poll(values).toEqual({ font: 'monospace', opacity: '0.85', gap: '16px' });
    await app.close();
    const again = await launchApp({ dir, ai: false });
    try {
      await again.page.getByRole('button', { name: /enter/i }).click();
      await expect(again.page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
        'font-family',
        'Georgia, serif',
      );
      const returned = await showPane(again.page, 'Mood');
      await returned.getByRole('button', { name: 'Theme', exact: true }).click();
      await expect(
        returned.getByRole('heading', { name: 'Theme Customizer', exact: true }),
      ).toBeVisible();
      await returned.getByRole('button', { name: 'Reset quick controls', exact: true }).click();
      await expect
        .poll(() =>
          again.page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--secondary-action-opacity')
              .trim(),
          ),
        )
        .toBe('0.85');
    } finally {
      await again.app.close();
    }
  } finally {
    await app.close().catch(() => {});
  }
});
