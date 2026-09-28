import { test, expect, type Locator, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { hidePane, runCommand, showPane } from './panel-helpers';
import { writeFirstFile } from './journeys/journey-helpers';

/**
 * With AI Tools off (Settings → AI, the default in a fresh garden) Crux
 * Garden is a whole app without them (Daniel, 2026-09-27): make, version,
 * share, export, dress and tend a Crux by hand, and nothing on screen speaks
 * of AI — no collaborator, no conversation, no agent, no prompt. Settings
 * keeps its one switch, which is the way back.
 */
const AI_WORDS = /\b(AI|collaborators?|Collaboration|agents?|Keeper|prompts?|persona)\b/;

/** The visible words of a surface (or the whole window), minus the Settings switch. */
async function words(scope: Page | Locator) {
  const root = 'locator' in scope && 'goto' in scope ? scope.locator('body') : (scope as Locator);
  return root.evaluate((el) => (el as HTMLElement).innerText);
}
async function expectNoAi(scope: Page | Locator, where: string) {
  const text = await words(scope);
  const hit = AI_WORDS.exec(text);
  expect(
    hit,
    `${where} mentions "${hit?.[0]}": …${text.slice(Math.max(0, (hit?.index ?? 0) - 60), (hit?.index ?? 0) + 60)}…`,
  ).toBeNull();
}

test('AI off: a whole Crux by hand, and nothing on screen is AI', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await expectNoAi(page, 'Garden Home');

    // The Add Crux question works without a collaborator to hand the idea to.
    await page.getByRole('button', { name: 'Add Crux' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'What do you want to make?' });
    await expect(dialog).toBeVisible();
    await expectNoAi(dialog, 'Add Crux');
    await page.keyboard.press('Escape');

    await createCrux(page, 'By hand');
    await expect(page.getByTestId('pane-body-artifacts')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pane-body-workshop')).toBeVisible();
    await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
    await expectNoAi(page, 'a new Crux');

    // Make: a file by hand, saved, previewed.
    const monaco = await writeFirstFile(page, 'index.html', '<h1>Made by hand</h1>');
    await expect(monaco).toContainText('Made by hand');
    await expectNoAi(page, 'the Crux with a file');

    // Version: ⌘K marks one; Growth shows it.
    await runCommand(page, 'mark a version', 'Mark a version');
    await expect(page.getByRole('status').filter({ hasText: 'Marked a version' })).toBeVisible({
      timeout: 30_000,
    });
    await runCommand(page, 'growth', 'Show Growth');
    const growth = page.getByTestId('pane-body-history');
    await expect(growth).toBeVisible({ timeout: 30_000 });
    await expectNoAi(growth, 'Growth');

    // Details, Share and Export read without AI.
    for (const [command, type] of [
      ['Show Details', 'details'],
      ['Show Share', 'publish'],
      ['Show Export', 'export'],
      ['Show Tasks', 'tasks'],
      ['Show Store', 'store'],
      ['Show Sync', 'sync'],
      ['Show Explore', 'explore'],
      ['Show Navigator', 'navigator'],
    ] as const) {
      await runCommand(page, command.toLowerCase(), command);
      const pane = page.getByTestId(`pane-body-${type}`);
      await expect(pane).toBeVisible({ timeout: 30_000 });
      await expectNoAi(pane, command);
    }

    // The Panels picker and ⌘K offer no AI panel or command.
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
    await expect(picker.getByRole('button', { name: 'Toggle growth', exact: true })).toBeVisible();
    await expectNoAi(picker, 'the Panels picker');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette.getByRole('option').first()).toBeVisible();
    await expectNoAi(palette, 'the command palette');
    await page.keyboard.press('Escape');

    // The Mood has no Persona; every tab reads without AI.
    const mood = await showPane(page, 'Mood');
    await expect(mood.getByRole('button', { name: 'Persona', exact: true })).toHaveCount(0);
    for (const tab of ['Moods', 'Theme', 'Background', 'Sound']) {
      await mood
        .getByRole('group', { name: 'Mood sections' })
        .getByRole('button', { name: tab, exact: true })
        .click();
      await expectNoAi(mood, `Mood → ${tab}`);
    }
    await hidePane(page, 'Mood');

    // Tending: schedules offer only what runs without AI.
    const tending = await showPane(page, 'Tending');
    await expectNoAi(tending, 'Tending');
    await tending.getByRole('button', { name: 'Schedule…' }).click();
    await expect(page.getByRole('button', { name: 'Send a prompt' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run a tool' })).toHaveCount(0);
    await expectNoAi(tending, 'a new schedule');
    await hidePane(page, 'Tending');

    // Settings: the switch is the only AI there is; Memory and Agents are gone.
    const settings = await showPane(page, 'Settings');
    await settings.locator('h2', { hasText: /^AI$/ }).click();
    await expect(settings.getByRole('switch', { name: 'Enable AI Tools' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(settings.getByTestId('agents-settings')).toHaveCount(0);
    await expect(settings.locator('h2', { hasText: /^Memory$/ })).toHaveCount(0);
  } finally {
    await app.close();
  }
});
