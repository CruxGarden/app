import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Mood and Synth live beside a Crux, reuse controls and restore through saved layouts', async () => {
  test.setTimeout(120000);
  const { app, page } = await launchApp({ sound: true });
  try {
    await enterGarden(page);
    await createCrux(page, 'Panel garden');
    const route = page.url();
    // Leave room for the instrument and one sectioned Mood panel.
    for (const label of ['tasks', 'collaboration', 'workshop']) {
      const button = page.getByRole('button', { name: `Toggle ${label}`, exact: true });
      if ((await button.getAttribute('aria-pressed')) === 'true') await button.click();
    }
    await page.getByRole('button', { name: 'Toggle crux synth', exact: true }).click();
    const synth = page.getByTestId('pane-body-synth');
    await expect(synth.getByRole('region', { name: 'Crux Synth' })).toBeVisible();
    await synth.getByRole('button', { name: 'Play synth' }).click();
    const state = () =>
      page.evaluate(() =>
        (
          window as unknown as { __cruxAudio: { state(): { playing: boolean; level: number } } }
        ).__cruxAudio.state(),
      );
    await expect.poll(async () => (await state()).level).toBeGreaterThan(0.005);
    await page.getByRole('button', { name: 'Close Crux Synth', exact: true }).click();
    expect((await state()).playing).toBe(true);
    await page.getByRole('button', { name: 'Toggle crux synth', exact: true }).click();
    await expect(synth.getByRole('button', { name: 'Pause synth' })).toBeVisible();
    await synth.getByRole('button', { name: 'Pause synth' }).click();
    await page.getByRole('button', { name: 'Toggle mood', exact: true }).click();
    const mood = page.getByTestId('pane-body-mood');
    // The existing splitter gives a newly opened panel a quarter: widen it for its controls.
    const splitter = await page.locator('.mosaic-split').first().boundingBox();
    const workspace = await page.locator('.mosaic').boundingBox();
    expect(splitter).not.toBeNull();
    expect(workspace).not.toBeNull();
    await page.mouse.move(splitter!.x + splitter!.width / 2, splitter!.y + splitter!.height / 2);
    await page.mouse.down();
    await page.mouse.move(workspace!.x + workspace!.width / 2, splitter!.y + splitter!.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(mood.getByRole('button', { name: 'Sound', exact: true })).toBeVisible();
    await mood.getByRole('button', { name: 'Sound', exact: true }).click();
    await mood.getByRole('combobox', { name: 'Synth harmony' }).selectOption('minor');
    await expect(synth.getByRole('combobox', { name: 'Synth harmony' })).toHaveValue('minor');
    expect(page.url()).toBe(route);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('textbox', { name: 'Workspace layout name' }).fill('Mood and music');
    await page.getByRole('button', { name: 'Save workspace layout', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close Mood', exact: true }).click();
    await expect(mood).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('button', { name: 'Apply workspace layout Mood and music' }).click();
    await page.keyboard.press('Escape');
    await expect(mood).toBeVisible();
    await expect(synth).toBeVisible();
    await page.screenshot({ path: 'e2e/.results/supporting-panels.png' });
  } finally {
    await app.close();
  }
});
