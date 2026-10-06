import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * A picture of the Collaboration pane after a scripted turn (CRUX_AI_MOCK):
 * the reply in the reading face, its tool call folded beneath, the pill
 * composer with the model chip under it. Opt-in: CRUX_CHAT_SHOT=1.
 */
test.skip(!process.env.CRUX_CHAT_SHOT, 'set CRUX_CHAT_SHOT=1');

test('collaboration look', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await createCrux(page, 'A page for the garden');
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill('Please write hello');
    await input.press('Enter');
    await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
      timeout: 30_000,
    });
    await input.fill('Now paint it in a warmer palette, and tell me what you changed.');
    await input.press('Enter');
    await expect(page.getByTestId('tool-call').nth(1)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/.results/chat-look.png' });
    const chat = page.getByTestId('pane-body-collaboration');
    await chat.screenshot({ path: 'e2e/.results/chat-look-pane.png' });
  } finally {
    await app.close();
  }
});
