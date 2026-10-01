import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

test('Glass family has readable light/dark palettes and editable persistent depth', async () => {
  const { app, page, dir } = await launchApp({ ai: false });
  const output = '../docs/glass-moods';
  mkdirSync(output, { recursive: true });
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await enterGarden(page);
    const mood = await showPane(page, 'Mood');
    await mood
      .getByTestId('material-material')
      .getByRole('button', { name: 'Glass', exact: true })
      .click();
    for (const mode of ['Light', 'Dark']) {
      await mood
        .getByTestId('material-mode')
        .getByRole('button', { name: mode, exact: true })
        .click();
      await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'glass');
      await expect(
        mood.getByTestId('material-material').getByRole('button', { name: 'Glass', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await page.mouse.move(0, 0);
      const contrast = await new AxeBuilder({ page })
        .setLegacyMode()
        .withRules(['color-contrast'])
        .analyze();
      writeFileSync(
        `${output}/${mode.toLowerCase()}-contrast.json`,
        JSON.stringify(
          { violations: contrast.violations, incomplete: contrast.incomplete },
          null,
          2,
        ),
      );
      expect.soft(contrast.violations).toEqual([]);
      await page.screenshot({ path: `${output}/${mode.toLowerCase()}.png` });
    }
    await mood
      .getByTestId('material-switch-depth')
      .getByRole('button', { name: 'Flat', exact: true })
      .click();
    const frame = mood.locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " mosaic-window ")][1]',
    );
    await expect(frame).toHaveCSS('box-shadow', 'none');
    await mood.getByRole('button', { name: 'Theme', exact: true }).click();
    await mood.getByRole('button', { name: 'Full Theme Builder', exact: true }).click();
    await mood.getByRole('searchbox', { name: 'Find a token' }).fill('glassFrameShadow');
    const shadow = mood.getByRole('textbox', { name: 'Glass frame shadow value', exact: true });
    await shadow.fill('2px 3px 0 #123456');
    await shadow.press('Enter');
    await expect(frame).toHaveCSS('box-shadow', 'rgb(18, 52, 86) 2px 3px 0px 0px');
    await app.close();
    const again = await launchApp({ dir, ai: false });
    try {
      await again.page.getByRole('button', { name: /enter/i }).click();
      await expect(again.page.locator('html')).toHaveAttribute('data-surface-style', 'glass');
      await expect(again.page.locator('.mosaic-window').first()).toHaveCSS(
        'box-shadow',
        'rgb(18, 52, 86) 2px 3px 0px 0px',
      );
    } finally {
      await again.app.close();
    }
  } finally {
    await app.close().catch(() => {});
  }
});
