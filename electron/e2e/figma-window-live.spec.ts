import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { member } from './game-cruxspace-helpers';

test('live macOS Figma arrangement restores the original windows', async () => {
  test.skip(
    process.env.CRUX_FIGMA_WINDOW_TRIAL !== '1',
    'Moves real native windows; explicit trial only',
  );
  const instance = await launchApp();
  const { page, app } = instance;
  const evidence = resolve(__dirname, '../../docs/figma-live');
  mkdirSync(evidence, { recursive: true });
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('crux-app://'))!
        .getBounds(),
    );
  const before = await bounds();
  try {
    await enterGarden(page);
    await member(page, /^Figma/, 'Figma window trial');
    await page.getByRole('button', { name: 'Arrange beside Figma', exact: true }).click();
    await expect
      .poll(async () => {
        const error = page.getByRole('alert');
        if (await error.count()) throw new Error(await error.innerText());
        return (await bounds()).width;
      })
      .toBe(420);
    await page.getByRole('button', { name: 'Workshop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Restore windows', exact: true })).toBeEnabled();
    const arranged = await bounds();
    await page.screenshot({ path: join(evidence, 'arranged-companion.png') });
    await page.getByRole('button', { name: 'Restore windows', exact: true }).click();
    await expect.poll(bounds).toEqual(before);
    await expect(page.getByRole('alert')).toHaveCount(0);
    writeFileSync(
      join(evidence, 'window-arrangement.json'),
      JSON.stringify({ before, arranged, restored: await bounds(), status: 'passed' }, null, 2),
    );
  } catch (error) {
    writeFileSync(
      join(evidence, 'window-arrangement.json'),
      JSON.stringify({ before, status: 'failed', error: (error as Error).message }, null, 2),
    );
    throw error;
  } finally {
    await page.evaluate(() => window.electronAPI!.figmaDesktop!.restore()).catch(() => {});
    await app.close();
  }
});
