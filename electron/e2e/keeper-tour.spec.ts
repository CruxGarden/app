import { enableAi, showPane } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact, goHome } from './multi-crux-helpers';

/**
 * The Keeper operates the workspace (GARDENS-ALL-THE-WAY-OUT: "ask the main
 * collaborator to explain Crux Garden … it would work right in front of you").
 * A scripted tour: the Keeper shows a crux (the console closes, the workspace
 * opens), opens the Artifacts pane, opens a file in the Workshop, records a
 * Growth snapshot, opens History, and names the garden — each step visible
 * to the person as it happens.
 */
test('the Keeper gives the tour by using the garden in front of the person', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Tour stop');
    await addArtifact(page, 'index.html');
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.type('<h1>Tour stop</h1>');
    await page.keyboard.press('ControlOrMeta+s');
    // Back home, panes closed: the tour has to open them.
    await goHome(page);
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();

    // The console is behind Enable AI Tools (a fresh garden has it off).
    await enableAi(page);
    await showPane(page, 'Console');
    // The Garden's Collaboration, wherever it is open.
    const console_ = page.getByTestId('pane-body-console');
    const composer = console_.getByPlaceholder('Send a message...');
    await composer.fill('[garden:tour] Show me how this works.');
    await composer.press('Enter');

    // The first show opens the crux (the Garden's console stays with the Garden).
    await expect(console_).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Tour stop',
    );
    // The panes the tour opens, in order; the file in the Workshop.
    await expect(page.getByTestId('pane-body-artifacts')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pane-body-history')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pane-body-history')).toContainText("The tour's first moment", {
      timeout: 30_000,
    });
    // The garden named, Collaboration renamed.
    await expect(page.locator('header').getByText('The Tour Garden')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.pane-toolbar-label', { hasText: 'The porch' })).toBeVisible();
    await page.screenshot({ path: 'e2e/.results/keeper-tour.png' });

    // The Keeper's account of it is in the console, work folded.
    await showPane(page, 'Console');
    await expect(console_.getByText('That was the tour')).toBeVisible({ timeout: 30_000 });
    await expect(console_.getByText('Used 6 tools')).toBeVisible();
  } finally {
    await app.close();
  }
});
