import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane, hidePane } from './panel-helpers';
import { expectToggleCentered } from './toggle-helpers';

/** Capture the six bundled Paper Moods through the actual picker in an isolated Garden.
 * CRUX_SHOTS=1 npm run test:e2e -- e2e/paper-variations.spec.ts --project=desktop */
test('Paper variation gallery', async () => {
  test.skip(!process.env.CRUX_SHOTS, 'Set CRUX_SHOTS=1 to capture the gallery.');
  test.setTimeout(180_000);
  const { app, page } = await launchApp({ ai: false });
  const output = '../docs/paper-variations';
  mkdirSync(output, { recursive: true });
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await enterGarden(page);
    for (const hue of ['Sunflower', 'Lagoon', 'Berry']) {
      for (const mode of ['Light', 'Dark']) {
        const mood = await showPane(page, 'Mood');
        await mood
          .getByTestId('material-material')
          .getByRole('button', { name: 'Paper', exact: true })
          .click();
        await mood
          .getByTestId('material-mode')
          .getByRole('button', { name: mode, exact: true })
          .click();
        await mood
          .getByTestId('material-hue')
          .getByRole('button', { name: hue, exact: true })
          .click();
        await expect(
          mood.getByTestId('material-hue').getByRole('button', { name: hue, exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await hidePane(page, 'Mood');
        const settings = await showPane(page, 'Settings');
        await expect(settings.getByText('When I open Crux Garden', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toHaveCSS(
          'border-width',
          '2px',
        );
        await page.mouse.click(600, 900);
        await page.waitForTimeout(350);
        for (const label of [
          'Resume my last workspace on startup',
          'Celebrate my first publication',
        ])
          await expectToggleCentered(settings.getByRole('switch', { name: label, exact: true }));
        await page.screenshot({
          path: `${output}/${hue.toLowerCase()}-${mode.toLowerCase()}.png`,
          animations: 'disabled',
        });
        await hidePane(page, 'Settings');
      }
    }
  } finally {
    await app.close();
  }
});
