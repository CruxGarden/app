import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { enableAi, showPane, hidePane } from './panel-helpers';

/**
 * The garden-level conversation (MAKING-IT-POSSIBLE step 6): from the Keeper's
 * console, a scripted turn plants a crux with a brief through plant_crux; the
 * console shows the reply in the Collaboration's look with the work folded
 * beneath, and the crux is in the garden.
 */
test('the Keeper plants a crux from the console', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    // The console is behind Enable AI Tools (a fresh garden has it off).
    await enableAi(page);
    const console_ = await showPane(page, 'Console');
    const composer = console_.getByPlaceholder('Send a message...');
    await composer.fill('[garden:plant] Plant a notes crux for the field study.');
    await composer.press('Enter');
    await expect(console_.getByText('Planted Field notes with its brief.')).toBeVisible({
      timeout: 60_000,
    });
    await expect(console_.getByTestId('tool-call')).toContainText('Planted Field notes');
    await page.screenshot({ path: 'e2e/.results/keeper-plants.png' });
    await hidePane(page, 'Console');
    await expect(page.getByText('Field notes', { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
  }
});
