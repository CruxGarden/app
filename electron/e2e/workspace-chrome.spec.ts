import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('panel chrome stays rounded and command controls remain aligned at compact sizes', async ({}, testInfo) => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Panel colors');
    for (const width of [1440, 900]) {
      await app.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setSize(width, 900),
        width,
      );
      const bar = page.getByTestId('command-bar');
      await expect(bar).toBeInViewport({ ratio: 1 });
      for (const pane of ['collaboration', 'workshop']) {
        const handle = page.locator(`.pane-${pane} .pane-toolbar`);
        await expect(handle).toBeVisible();
        await handle.hover();
        expect(
          await handle.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
        ).toBeGreaterThan(0);
        await page.waitForTimeout(250);
        const icon = page
          .getByTestId('builder-lane')
          .getByRole('button', { name: `Toggle ${pane}` });
        const color = await icon.evaluate((el) => getComputedStyle(el).backgroundColor);
        await expect(handle).toHaveCSS('background-color', color);
        await page.screenshot({ path: testInfo.outputPath(`header-${width}-${pane}.png`) });
      }
      const geometry = await bar.evaluate((el) =>
        Array.from(el.children)
          .filter((child) => child.getBoundingClientRect().width)
          .map((child) => {
            const b = child.getBoundingClientRect();
            return { x: b.x, right: b.right, center: b.y + b.height / 2 };
          }),
      );
      for (let i = 1; i < geometry.length; i++) {
        expect(geometry[i]!.x - geometry[i - 1]!.right).toBeGreaterThanOrEqual(11);
        expect(Math.abs(geometry[i]!.center - geometry[i - 1]!.center)).toBeLessThan(1);
      }
    }
  } finally {
    await app.close();
  }
});
