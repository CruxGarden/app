import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { member } from './game-cruxspace-helpers';

test('multiple native Blender sessions refuse automatic placement without moving Garden', async () => {
  test.skip(
    process.env.CRUX_BLENDER_AMBIGUITY_TRIAL !== '1',
    'Requires the original and disposable Blender sessions',
  );
  const instance = await launchApp();
  try {
    const { page, app } = instance;
    await enterGarden(page);
    await member(page, /^Blender/, 'Blender placement ambiguity');
    const bounds = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('crux-app://'))!
          .getBounds(),
      );
    const before = await bounds();
    await page.getByRole('button', { name: 'Arrange beside Garden', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('More than one Blender session is open.');
    expect(await bounds()).toEqual(before);
    expect((await page.evaluate(() => window.electronAPI!.blenderDesktop!.status())).arranged).toBe(
      false,
    );
  } finally {
    await instance.app.close();
  }
});
