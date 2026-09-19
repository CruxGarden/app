import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * Synth Cues (SYNTH-CUES-PLAN): under Mood → Sound a cue is picked from a
 * preset bank grouped by register, or crafted; a crafted cue is a patch the
 * Mood keeps, shows as "(yours)", and survives leaving and coming back.
 * Sound stays off here, so nothing is heard; what is asserted is the choice.
 */
test('a cue is a preset from the bank, or one of your own', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const goSound = async () => {
      await page.evaluate(() => {
        window.history.pushState({}, '', '/mood?tab=sound');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(
        page.getByRole('combobox', { name: 'Cue for Snapshot taken', exact: true }),
      ).toBeVisible();
    };
    await goSound();
    const snapshot = page.getByRole('combobox', { name: 'Cue for Snapshot taken', exact: true });
    // The bank is grouped, and the Plasma register is there.
    await expect(snapshot.locator('optgroup')).toHaveCount(6);
    await expect(snapshot.locator('optgroup[label="Plasma"] option')).toHaveCount(3);
    // Plasma, the Default Mood, chooses from its own register.
    await expect(snapshot).toHaveValue('ripple');
    await snapshot.selectOption('dew');
    await expect(snapshot).toHaveValue('dew');

    // Craft one: the editor opens on the current choice and every change is kept.
    await page.getByRole('button', { name: 'Craft cue for Snapshot taken' }).click();
    const editor = page.getByTestId('cue-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Cue name')).toHaveValue('Dew (yours)');
    await editor.getByLabel('Wave').selectOption('square');
    await editor.getByLabel('Cue name').fill('Two drops');
    await editor.getByLabel('Notes').fill('A5 E5 A4');
    await editor.getByLabel('Notes').press('Enter');
    await expect(snapshot).toHaveValue('__own');
    await expect(snapshot.locator('option[value="__own"]')).toHaveText('Two drops (yours)');

    // It is the Mood's now: leave and come back.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/home');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    await goSound();
    await expect(
      page.getByRole('combobox', { name: 'Cue for Snapshot taken', exact: true }),
    ).toHaveValue('__own');
    await expect(
      page
        .getByRole('combobox', { name: 'Cue for Snapshot taken', exact: true })
        .locator('option[value="__own"]'),
    ).toHaveText('Two drops (yours)');

    // Back to a preset drops the patch.
    await page.getByRole('button', { name: 'Craft cue for Snapshot taken' }).click();
    await page.getByTestId('cue-editor').getByRole('button', { name: 'Back to preset' }).click();
    await expect(
      page.getByRole('combobox', { name: 'Cue for Snapshot taken', exact: true }),
    ).toHaveValue('tick');
    await expect(page.getByTestId('cue-editor')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
