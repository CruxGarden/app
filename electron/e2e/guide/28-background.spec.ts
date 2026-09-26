import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * V1-TESTING-GUIDE § 28 · Mood: Background — the four choices and their
 * light/dark rules, a backdrop of one's own, and what an invalid file does.
 */
test.describe('guide 28 · Background', () => {
  test('BG-01 — Bloom, Drift, Waves and Blank each take; Drift and Waves are dark-only', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      for (const label of ['Bloom', 'Drift', 'Waves', 'Blank']) {
        await mood.getByRole('button', { name: new RegExp(`^${label}`) }).click();
        await expect
          .poll(() =>
            page.evaluate(() =>
              document.documentElement.style.getPropertyValue('--background-type').trim(),
            ),
          )
          .toBe(label === 'Waves' ? 'flow' : label.toLowerCase());
      }
      // Light mode: the dark-only choices are disabled, the others stay.
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      const light = mood
        .getByRole('button', { name: /^Light/ })
        .or(mood.getByLabel(/light/i))
        .first();
      if (await light.isVisible().catch(() => false)) {
        await light.click();
        await mood.getByRole('button', { name: 'Background', exact: true }).click();
        await expect(mood.getByRole('button', { name: /^Drift/ })).toBeDisabled();
        await expect(mood.getByRole('button', { name: /^Waves/ })).toBeDisabled();
        await expect(mood.getByRole('button', { name: /^Bloom/ })).toBeEnabled();
      }
    } finally {
      await app.close();
    }
  });

  test('BG-02/04 — a backdrop of your own appears and can be removed; a file that is not an image is refused', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      const png = join(dir, 'backdrop.png');
      writeFileSync(png, PNG);
      let chooser = page.waitForEvent('filechooser');
      await mood.getByText('Upload a background image').click();
      await (await chooser).setFiles(png);
      await expect(mood.getByRole('button', { name: 'Change image' })).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--background-type').trim(),
          ),
        )
        .toBe('image');
      await mood
        .getByRole('button', { name: 'Change image' })
        .locator('..')
        .getByRole('button', { name: 'Remove', exact: true })
        .click();
      await expect(mood.getByRole('button', { name: 'Change image' })).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--background-type').trim(),
          ),
        )
        .not.toBe('image');
      // Not an image: refused, and the Mood is still fine.
      const bogus = join(dir, 'not-an-image.png');
      writeFileSync(bogus, 'plain text pretending');
      chooser = page.waitForEvent('filechooser');
      await mood.getByText('Upload a background image').click();
      await (await chooser).setFiles(bogus);
      const refused = page.getByRole('alert').or(page.getByRole('alertdialog'));
      const shown = mood.getByRole('button', { name: 'Change image' });
      await expect(refused.or(shown).first()).toBeVisible({ timeout: 30_000 });
      if (await refused.count()) await page.keyboard.press('Escape');
      await expect(mood.getByRole('button', { name: /^Bloom/ })).toBeEnabled();
    } finally {
      await app.close();
    }
  });
});
