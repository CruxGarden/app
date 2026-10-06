import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Following a streaming reply in a Crux's Collaboration (coverage audit,
 * October 3: no targeted scroll-away/continued-stream assertion for the
 * message list). The scripted "Stream a reading review" reply (CRUX_AI_MOCK)
 * adds one paragraph every 150 ms for 120 notes. Asserted in the DOM:
 *  1. at the end, the list follows the reply as it grows;
 *  2. a keyboard scroll up stops following — the reading position holds while
 *     the reply keeps growing below, and "Latest reply" appears;
 *  3. scrolling back to the end (not the button) resumes following and hides it.
 * conversation-reading.spec covers the wheel gesture and the button's return.
 */
test('a streaming reply is followed at the end, left alone after scrolling up, and followed again back at the end', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Follow the stream');
    const pane = page.getByTestId('pane-body-collaboration');
    const composer = pane.getByPlaceholder('Send a message...');
    const scroller = pane.getByRole('region', { name: 'Collaboration messages', exact: true });
    const latestButton = pane.getByRole('button', { name: 'Latest reply', exact: true });
    const reply = pane.locator('[data-streaming="true"]');

    const distanceFromEnd = () =>
      scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
    const scrollTop = () => scroller.evaluate((el) => el.scrollTop);
    const scrollHeight = () => scroller.evaluate((el) => el.scrollHeight);
    const lastNote = async () =>
      Math.max(
        0,
        ...Array.from((await reply.innerText()).matchAll(/Reading note (\d+):/g), (m) =>
          Number(m[1]),
        ),
      );

    await composer.fill('Stream a reading review');
    await composer.press('Enter');
    await expect(reply).toContainText('Reading note 20:', { timeout: 30_000 });
    // The reply overflows the list, so following is observable.
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(200);

    // 1. Following: the end stays in view while the reply grows.
    const followTop = await scrollTop();
    await expect.poll(distanceFromEnd).toBeLessThan(10);
    await expect(reply).toContainText(`Reading note ${(await lastNote()) + 5}:`);
    await expect.poll(distanceFromEnd).toBeLessThan(10);
    expect(await scrollTop()).toBeGreaterThan(followTop);
    await expect(latestButton).toBeHidden();

    // 2. Scroll up with the keyboard: following stops at once (the key, not the scroll).
    await scroller.focus();
    for (let i = 0; i < 3; i++) await scroller.press('PageUp');
    let previous = -1;
    let settled = 0;
    await expect
      .poll(
        async () => {
          const top = await scrollTop();
          settled = Math.abs(top - previous) < 1 ? settled + 1 : 0;
          previous = top;
          return settled;
        },
        { intervals: [100, 200, 250] },
      )
      .toBeGreaterThanOrEqual(2);
    const readingTop = await scrollTop();
    const readingHeight = await scrollHeight();
    expect(await distanceFromEnd()).toBeGreaterThan(48);
    await expect(latestButton).toBeVisible();
    // The reply keeps arriving below; the reading position does not move.
    await expect(reply).toContainText(`Reading note ${(await lastNote()) + 8}:`);
    expect(Math.abs((await scrollTop()) - readingTop)).toBeLessThan(2);
    expect(await scrollHeight()).toBeGreaterThan(readingHeight);
    expect(await distanceFromEnd()).toBeGreaterThan(48);
    await expect(latestButton).toBeVisible();
    // "Latest reply" sits under the list, not over the text being read.
    const listBox = (await scroller.boundingBox())!;
    const buttonBox = (await latestButton.boundingBox())!;
    expect(buttonBox.y).toBeGreaterThanOrEqual(listBox.y + listBox.height);

    // 3. Back at the end by scrolling (not the button): following resumes.
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(distanceFromEnd).toBeLessThan(10);
    await expect(latestButton).toBeHidden();
    const resumedTop = await scrollTop();
    await expect(reply).toContainText(`Reading note ${(await lastNote()) + 6}:`);
    await expect.poll(distanceFromEnd).toBeLessThan(10);
    expect(await scrollTop()).toBeGreaterThan(resumedTop);
    await expect(latestButton).toBeHidden();

    await pane.getByTestId('composer').getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(reply).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await app.close();
  }
});
