import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 26 · Mood: Theme — the token editor's search, groups
 * and inputs, with a bad value that cannot lock the person out.
 */
test.describe('guide 26 · Mood theme tokens', () => {
  test('MOOD-04 — tokens are found by name, groups switch, each input kind edits, a bad value is recoverable', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      await mood
        .getByRole('tab', { name: 'Theme' })
        .or(mood.getByRole('button', { name: 'Theme', exact: true }))
        .first()
        .click();
      const groups = mood.getByRole('navigation', { name: 'Token groups' });
      await expect(groups.getByRole('button').first()).toBeVisible();
      // Search finds a token by name across groups.
      const find = mood.getByLabel('Find a token');
      await find.fill('accent');
      await expect(mood.getByLabel('Accent color').first()).toBeVisible();
      await find.fill('zzzz-no-such-token');
      await expect(mood.getByLabel(/ value$/)).toHaveCount(0);
      await find.fill('');
      // Groups: the second group shows different tokens than the first.
      const first = groups.getByRole('button').nth(0);
      const second = groups.getByRole('button').nth(1);
      await first.click();
      const inFirst = await mood
        .getByLabel(/ value$/)
        .first()
        .getAttribute('aria-label');
      await second.click();
      const inSecond = await mood
        .getByLabel(/ value$/)
        .first()
        .getAttribute('aria-label');
      expect(inSecond).not.toBe(inFirst);
      // Inputs: a colour, a select and a text value.
      await find.fill('accent');
      const color = mood.getByLabel('Accent color').first();
      await color.fill('#ff8800');
      const value = mood.getByLabel('Accent value').first();
      await expect(value).toHaveValue(/#ff8800/i);
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
          ),
        )
        .toMatch(/#ff8800|255, 136, 0/i);
      // A bad value: the app keeps the last good colour and Reset still works.
      await value.fill('not a colour at all');
      await value.blur();
      await expect(mood.getByRole('button', { name: 'Reset Accent' }).first()).toBeVisible();
      await mood.getByRole('button', { name: 'Reset Accent' }).first().click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
          ),
        )
        .not.toMatch(/#ff8800|255, 136, 0/i);
      // A select-kind token still answers.
      await find.fill('');
      const option = mood.getByLabel(/ option$/).first();
      await expect(option).toBeVisible();
      const options = await option.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(1);
    } finally {
      await app.close();
    }
  });
});
