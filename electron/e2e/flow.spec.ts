import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('Flow follows creative work, settles, and keeps its Mood settings after restart', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const level = () =>
    page.evaluate(() =>
      Number(document.documentElement.style.getPropertyValue('--signal-activity')),
    );
  try {
    await enterGarden(page);
    await createCrux(page, 'Flow study');
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Flow', exact: true });
    const sensitivity = page.getByRole('slider', { name: 'Sensitivity', exact: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(sensitivity).toHaveValue('50');

    await toggle.click();
    await expect(sensitivity).toBeDisabled();
    await expect.poll(level).toBe(0);
    await expect(page.locator('canvas.plasma-ground').first()).toHaveCSS(
      'filter',
      'saturate(1) brightness(1)',
    );
    await toggle.click();
    await sensitivity.fill('100');
    await page.keyboard.press('Escape');
    const composer = page.getByPlaceholder('Send a message...');
    await composer.waitFor();
    await page.screenshot({ path: 'e2e/.results/flow-quiet.png' });
    // Actual writing, not a pinned CSS variable: the rim reads the same live
    // envelope through React and the material's configure() path.
    await composer.pressSequentially('A glowing garden coming to life as we create together.', {
      delay: 80,
    });
    await expect.poll(level).toBeGreaterThan(0.45);
    await composer.clear();
    await page.screenshot({ path: 'e2e/.results/flow-awake.png' });
    const awake = await level();
    // Advance a quiet stretch, without waiting minutes or synthesising activity.
    await page.clock.install();
    await page.clock.fastForward(180_000);
    await expect.poll(level).toBeLessThan(awake * 0.5);
    await page.clock.resume();

    // A collaborator alone can wake it too. Reset Flow and send through the
    // ordinary UI handler without trusted pointer/typing events, so this
    // cannot pass solely because the test clicked or typed.
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await toggle.click();
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect.poll(level).toBe(0);
    await composer.fill('Please write hello');
    await page
      .getByRole('button', { name: 'Send', exact: true })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible();
    await expect.poll(level).toBeGreaterThan(0.4);

    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await sensitivity.fill('27');
    await toggle.click();
    await expect.poll(level).toBe(0);
    await page.screenshot({ path: 'e2e/.results/flow-settings.png' });
    await app.close();

    const again = await launchApp({ dir });
    try {
      await again.page.getByRole('button', { name: /enter/i }).click();
      await again.page.getByRole('button', { name: 'Mood', exact: true }).click();
      await expect(again.page.getByRole('switch', { name: 'Flow', exact: true })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      await expect(
        again.page.getByRole('slider', { name: 'Sensitivity', exact: true }),
      ).toHaveValue('27');
    } finally {
      await again.app.close();
    }
  } finally {
    await app.close().catch(() => {});
  }
});

test('creative input inside a Workshop frame contributes before it is saved', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Flow sketch');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    writeFileSync(
      join(folder, 'index.html'),
      '<!doctype html><html><body><textarea aria-label="Creative sketch"></textarea></body></html>',
    );
    const sketch = page
      .frameLocator('iframe[src^="http://127.0.0.1"]')
      .getByRole('textbox', { name: 'Creative sketch' });
    await expect(sketch).toBeVisible();
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Flow', exact: true });
    await toggle.click();
    await toggle.click();
    await page.getByRole('slider', { name: 'Sensitivity', exact: true }).fill('100');
    await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('crux-app://'),
      )!;
      window.focus();
      window.webContents.focus();
    });
    await sketch.click();
    // CDP typing bypasses Electron's native input hooks. Send real desktop
    // input through webContents, with focus inside the cross-origin frame.
    for (const key of 'making a sketch together without a single save') {
      await app.evaluate(({ BrowserWindow }, key) => {
        const contents = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('crux-app://'),
        )!.webContents;
        contents.sendInputEvent({
          type: 'keyDown',
          keyCode: key === ' ' ? 'Space' : key.toUpperCase(),
        });
        contents.sendInputEvent({ type: 'char', keyCode: key });
        contents.sendInputEvent({
          type: 'keyUp',
          keyCode: key === ' ' ? 'Space' : key.toUpperCase(),
        });
      }, key);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Native dispatch exercises the desktop hook; CDP asserts the iframe remains editable.
    await sketch.fill('Unsaved sketch');
    await expect(sketch).toHaveValue('Unsaved sketch');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(document.documentElement.style.getPropertyValue('--signal-activity')),
        ),
      )
      .toBeGreaterThan(0.45);
  } finally {
    await app.close();
  }
});
