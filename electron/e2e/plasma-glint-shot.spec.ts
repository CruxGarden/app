import { test } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, enterGarden } from './multi-crux-helpers';

/** Evidence: the pointer highlight at sharpness 0 and at the Plasma Mood's value, over a pane. */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';
test('plasma glint shot', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await createCrux(page, 'Water');
    // Just inside the Workshop pane's top edge: that edge faces the light held above the pointer.
    const pane = await page.getByTestId('pane-body-workshop').boundingBox();
    const x = pane!.x + pane!.width * 0.4;
    const y = pane!.y + 70;
    const setSharp = (v: string) =>
      page.evaluate((v) => {
        document.documentElement.style.setProperty('--plasma-highlight-sharpness', v);
        document.dispatchEvent(new Event('palette-change'));
      }, v);
    await page.mouse.move(x - 40, y - 30);
    await page.mouse.move(x, y, { steps: 8 });
    await setSharp('0');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/glint-0.png` });
    await setSharp('1');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/glint-1.png` });
    await page.screenshot({
      path: `${SHOTS}/glint-1-close.png`,
      clip: { x: x - 300, y: y - 140, width: 600, height: 260 },
    });
  } finally {
    await app.close();
  }
});
