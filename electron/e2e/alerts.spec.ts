import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * The Alerts inbox (GARDEN-SCHEDULER-PLAN §2): a Tending transition — the
 * mock agent asking to run a command — raises one alert behind the bell;
 * Open lands on the decision; answering it resolves the alert; Snooze and
 * Later put one away; the inbox survives a restart.
 */
test('a pending decision is an alert; answering it resolves the alert', async () => {
  test.setTimeout(180_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_AGENT_MOCK: '1' } });
  const dir = first.dir;
  let { app, page } = first;
  try {
    await enterGarden(page);
    const bell = page.getByTestId('alerts-bell');
    await expect(bell).toBeVisible();
    await expect(page.getByTestId('alerts-count')).toHaveCount(0);

    await createCrux(page, 'Lantern');
    await page.getByTestId('pane-body-collaboration').getByTestId('model-selector').click();
    await page
      .getByTestId('model-group-claude-code')
      .getByRole('button', { name: 'Claude Code' })
      .click();
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('run the check');
    await input.press('Enter');
    await expect(page.getByTestId('agent-approvals')).toBeVisible({ timeout: 30_000 });

    // One alert, named for the Crux, saying what it wants.
    await expect(page.getByTestId('alerts-count')).toHaveText('1');
    await bell.click();
    const menu = page.getByTestId('alerts-menu');
    const alert = menu.getByTestId('alert');
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText('Lantern');
    await expect(alert).toHaveAttribute('data-kind', 'tending');
    // Names and reasons only: never the prompt.
    await expect(alert).not.toContainText('run the check');

    // Later puts it away; Escape closes; the count drops.
    await alert.getByRole('button', { name: 'Later' }).click();
    await expect(page.getByTestId('alerts-count')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // A restart wakes a "later" alert — the decision is still pending.
    await app.close();
    ({ app, page } = await launchApp({ dir, env: { CRUX_AI_MOCK: '1', CRUX_AGENT_MOCK: '1' } }));
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByTestId('alerts-count')).toHaveText('1', { timeout: 30_000 });
    await page.getByTestId('alerts-bell').click();
    // Open goes to the decision, or to Tending when the run did not survive the restart.
    await page.getByTestId('alerts-menu').getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/(c\/|tending)/);

    // Done clears it for good.
    await page.getByTestId('alerts-bell').click();
    await page.getByTestId('alerts-menu').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('alerts-count')).toHaveCount(0);
    // The list stays open and says so.
    await expect(page.getByTestId('alerts-menu')).toContainText('Nothing needs you right now');
  } finally {
    await app.close();
  }
});
