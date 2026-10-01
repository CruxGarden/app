import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane, hidePane } from './panel-helpers';

test('paper Moods apply, builder controls reach pixels, and edits survive restart without AI', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp({ ai: false });
  const output = '../docs/expedition-moods';
  mkdirSync(output, { recursive: true });
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await enterGarden(page);
    const mood = await showPane(page, 'Mood');
    for (const mode of ['Light', 'Dark']) {
      await mood
        .getByRole('button', { name: `Apply Expedition Sunflower ${mode}`, exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
        'border-width',
        '2px',
      );
      await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
        'border-top-left-radius',
        '6px',
      );
      await hidePane(page, 'Mood');
      await showPane(page, 'Settings');
      await expect(
        page
          .getByTestId('pane-body-settings')
          .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " mosaic-window ")][1]',
          ),
      ).toHaveCSS('box-shadow', /4px 5px 0px/);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(350);
      const contrast = await new AxeBuilder({ page })
        .setLegacyMode()
        .withRules(['color-contrast'])
        .analyze();
      writeFileSync(
        `${output}/contrast-${mode.toLowerCase()}.json`,
        JSON.stringify(
          { violations: contrast.violations, incomplete: contrast.incomplete },
          null,
          2,
        ),
      );
      expect.soft(contrast.violations, JSON.stringify(contrast.violations, null, 2)).toEqual([]);
      await page.screenshot({ path: `${output}/sunflower-${mode.toLowerCase()}.png` });
      await hidePane(page, 'Settings');
      await showPane(page, 'Mood');
    }
    await mood.getByRole('combobox', { name: 'Surface theme' }).selectOption('custom');
    await mood.getByRole('button', { name: 'Theme', exact: true }).click();
    await mood.getByRole('button', { name: 'Elevation & motion', exact: true }).click();
    const shadow = mood.getByRole('textbox', {
      name: 'Elevation primary button value',
      exact: true,
    });
    await shadow.fill('3px 4px 0 #ff00ff');
    await shadow.press('Enter');
    await mood.getByRole('button', { name: 'Foundation', exact: true }).click();
    const muted = mood.getByRole('textbox', { name: 'Text muted value', exact: true });
    await muted.fill('rgba(240, 230, 220, 0.6)');
    await muted.press('Enter');
    const alpha = mood.getByRole('spinbutton', { name: 'Text muted opacity percent', exact: true });
    await expect(alpha).toHaveValue('60');
    await alpha.fill('80');
    await alpha.press('Tab');
    await expect(muted).toHaveValue('rgba(240, 230, 220, 0.8)');
    await hidePane(page, 'Mood');
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
      'box-shadow',
      'rgb(255, 0, 255) 3px 4px 0px 0px',
    );
    await expect(page.getByRole('button', { name: 'Add a Garden brief', exact: true })).toHaveCSS(
      'color',
      'rgba(240, 230, 220, 0.8)',
    );
    await app.close();
    const again = await launchApp({ dir, ai: false });
    try {
      await again.page.getByRole('button', { name: /enter/i }).click();
      await expect(again.page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
        'box-shadow',
        'rgb(255, 0, 255) 3px 4px 0px 0px',
      );
      await expect(
        again.page.getByRole('button', { name: 'Add a Garden brief', exact: true }),
      ).toHaveCSS('color', 'rgba(240, 230, 220, 0.8)');
    } finally {
      await again.app.close();
    }
  } finally {
    await app.close().catch(() => {});
  }
});
