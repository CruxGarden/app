import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome, switchCrux } from '../multi-crux-helpers';
import { showPane, hidePane } from '../panel-helpers';

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

  test('MOOD-02 — the five tabs edit one Mood: a change on each stays put while the others and the Mood Bar are untouched', async () => {
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await enterGarden(page);
      const bar = page.getByRole('region', { name: 'Mood Bar' });
      await expect(bar).toBeVisible({ timeout: 30_000 });
      const barBefore = await bar.textContent();
      const mood = await showPane(page, 'Mood');
      // One editor with five tabs; no Builder page.
      for (const tab of ['Moods', 'Theme', 'Background', 'Sound', 'Persona'])
        await expect(mood.getByRole('button', { name: tab, exact: true })).toBeVisible();
      await expect(mood.getByRole('button', { name: /Builder/ })).toHaveCount(0);
      // Persona: a name.
      await mood.getByRole('button', { name: 'Persona', exact: true }).click();
      await mood.getByPlaceholder('Persona name').fill('Fern');
      await page.waitForTimeout(400);
      // Background: Blank.
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      await mood.getByRole('button', { name: /^Blank/ }).click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--background-type').trim(),
          ),
        )
        .toBe('blank');
      // Theme: the accent.
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      await mood.getByLabel('Find a token').fill('accent');
      await mood.getByLabel('Accent color').first().fill('#ff8800');
      await expect.poll(() => cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      // Each earlier change is still there after the others.
      await mood.getByRole('button', { name: 'Persona', exact: true }).click();
      await expect(mood.getByPlaceholder('Persona name')).toHaveValue('Fern');
      await mood.getByRole('button', { name: 'Background', exact: true }).click();
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--background-type').trim(),
        ),
      ).toBe('blank');
      await mood.getByRole('button', { name: 'Sound', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Crux Synth', exact: true })).toBeVisible();
      expect(await cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      // The Mood Bar shows the same Mood as before: no tab replaced it.
      await expect(bar).toBeVisible();
      expect(await bar.textContent()).toBe(barBefore);
      await expect(bar.getByRole('button', { name: /^Open Mood/ })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('MOOD-12 — a saved Mood: a Builder tweak survives moving between Cruxes, it never becomes a Home card, and it cannot be deleted while worn', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await enterGarden(page);
      let mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Save current as Mood' }).click();
      await mood.getByRole('textbox', { name: 'Mood name' }).fill('Mine');
      await mood.getByRole('button', { name: 'Save', exact: true }).click();
      const apply = mood.getByRole('button', { name: 'Apply Mine', exact: true });
      await expect(apply).toBeVisible();
      if ((await apply.getAttribute('aria-pressed')) !== 'true') await apply.click();
      await expect(apply).toHaveAttribute('aria-pressed', 'true');
      // A tweak in the Builder (Theme tab).
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      await mood.getByLabel('Find a token').fill('accent');
      await mood.getByLabel('Accent color').first().fill('#ff8800');
      await expect.poll(() => cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      await hidePane(page, 'Mood');
      // Crux to Crux and back, in the same Garden.
      await createCrux(page, 'Crux A');
      await createCrux(page, 'Crux B');
      expect(await cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      await switchCrux(page, 'Crux A');
      expect(await cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      // Home lists projects, never the saved Mood.
      await goHome(page);
      const home = page.getByTestId('pane-body-home');
      await expect(home.getByRole('button', { name: 'Open Crux A', exact: true })).toBeVisible();
      await expect(home.getByRole('button', { name: 'Open Mine', exact: true })).toHaveCount(0);
      expect(await cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      // The worn Mood cannot be deleted; wear another and it can.
      mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Moods', exact: true }).click();
      await expect(mood.getByRole('button', { name: 'Apply Mine', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(
        mood.getByRole('button', { name: 'Delete Mood Mine', exact: true }),
      ).toBeDisabled();
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect(mood.getByRole('button', { name: 'Apply Mine', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(
        mood.getByRole('button', { name: 'Delete Mood Mine', exact: true }),
      ).toBeEnabled();
      await mood.getByRole('button', { name: 'Delete Mood Mine', exact: true }).click();
      await expect(mood.getByRole('button', { name: 'Apply Mine', exact: true })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
