import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { enableAi, showPane, hidePane } from '../panel-helpers';

/** The Garden's own collaborator plants a Crux from its Collaboration pane. */
test('the Garden’s collaborator plants a Crux', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await enableAi(page);
    const console_ = await showPane(page, 'Console');
    const composer = console_.getByPlaceholder('Send a message...');
    await composer.fill('[garden:plant] Plant a notes crux for the field study.');
    await composer.press('Enter');
    await expect(console_.getByText('Planted Field notes with its brief.').first()).toBeVisible({
      timeout: 60_000,
    });
    await hidePane(page, 'Console');
    await expect(page.getByRole('button', { name: 'Open Field notes', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await app.close();
  }
});
