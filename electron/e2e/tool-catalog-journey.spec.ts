import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, goHome, reenterWorkspace, storedCrux } from './multi-crux-helpers';
import { startMockApi } from './api-mock';
import { showPane, hidePane, openPanel, chooseSettingsSection } from './panel-helpers';

/**
 * The catalog journey end to end against the mock API (coverage audit,
 * October 3: "no complete publish → Explore → separate-account clean install"):
 *  A. account A makes a tool (Add Crux → "Make a tool"), shares it and makes it
 *     Discoverable;
 *  B. account B, on a fresh profile, finds it in Explore → Tools, reads its
 *     trust details (publisher, version, sandbox) before installing, installs,
 *     and makes a Crux from it;
 *  C. B restarts and still has the tool and the Crux, with the saved note.
 *
 * Needs from api-mock.ts (see the worker report): Explore rows and the public
 * crux route carry `toolSummary` for a published tool, as the API's
 * `withPublicMeta` does.
 */

async function signIn(page: Page, email: string) {
  const settings = await showPane(page, 'Settings');
  await chooseSettingsSection(page, 'Account');
  const account = settings.getByTestId('account-settings');
  await account.getByPlaceholder('email@example.com').fill(email);
  await account.getByRole('button', { name: 'Send Code' }).click();
  await account.getByPlaceholder('Enter code').fill('123456');
  await account.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(account.getByText(/Connected —/)).toContainText(email, { timeout: 30_000 });
  await hidePane(page, 'Settings');
}

async function exploreTools(page: Page) {
  await showPane(page, 'Explore');
  const explore = page.getByRole('region', { name: 'Explore', exact: true });
  await explore.getByRole('tab', { name: 'Tools', exact: true }).click();
  return explore;
}

test('a tool made and shared by one account is found, reviewed, installed and kept by another', async () => {
  const info = test.info();
  test.setTimeout(240_000);
  const api = await startMockApi();
  let toolCruxId = '';

  // ── A: make the tool and share it Discoverable ──
  const publisher = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = publisher;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByLabel('Find a starting point').fill('Make a tool');
    await page.locator('[data-template-id="tool-starter"]').click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toBeVisible({ timeout: 60_000 });
    await frame.getByLabel('Your note').fill('Publisher-only note');
    await frame.getByRole('button', { name: 'Save note' }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    toolCruxId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;

    // Shared as a Tool template, so it publishes its package.
    await openPanel(page, 'details', 'Toggle details');
    const badge = page.getByRole('button', {
      name: /^(auto|Web App|Page|Document|Image|Tool template)$/i,
    });
    for (let i = 0; i < 8 && !/Tool template/i.test(await badge.innerText()); i++)
      await badge.click();
    await expect(badge).toHaveText('Tool template');

    await openPanel(page, 'publish', 'Toggle share');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const backup = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
    await expect(backup).toBeVisible();
    await backup.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(page.getByText('Up to date')).toBeVisible({ timeout: 45_000 });
    await page.getByRole('switch', { name: 'Discoverable' }).click();
    await expect.poll(() => api.state.cruxes[toolCruxId]?.discoverable).toBe(true);
    expect(api.state.cruxes[toolCruxId]?.kind).toBe('tool');
    // The installable package went up with it.
    expect((api.state.published[toolCruxId] ?? []).map((file) => file.path)).toContain(
      '_crux/tool-package.zip',
    );
  } finally {
    await publisher.app.close();
  }

  // ── B: a different account on a fresh profile finds, reviews and installs it ──
  const recipient = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  let recipientCruxId: string;
  try {
    const { page } = recipient;
    await enterGarden(page);
    await signIn(page, 'other@example.com');
    expect(api.state.loginEmail).toBe('other@example.com');

    // Nothing installed yet on this profile.
    const before = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Tools and Moods');
    await expect(before.getByTestId('installed-tools')).toContainText('None yet');
    await hidePane(page, 'Settings');

    const explore = await exploreTools(page);
    const card = explore.getByTestId('explore-tool-pocket-notes');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Pocket Notes');
    await expect(card.getByTestId('tool-installed')).toHaveCount(0);

    // Trust details before anything is installed: who publishes it, which version, the sandbox.
    await card.locator('summary', { hasText: 'Details' }).click();
    const trust = card.getByTestId('tool-trust-details');
    await expect(trust).toBeVisible();
    await expect(trust).toContainText('Publisher');
    await expect(trust).toContainText('@tester');
    await expect(trust).toContainText('Version');
    await expect(trust).toContainText('1.0.0');
    await expect(trust).toContainText('Runs in a sandbox.');
    // Reading the details installs nothing.
    await expect(card.getByTestId('tool-installed')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('catalog-trust-details.png') });

    await card.getByRole('button', { name: /^Install/ }).click();
    await expect(card.getByTestId('tool-installed')).toBeVisible({ timeout: 60_000 });
    await expect(card.getByTestId('tool-installed')).toContainText('Pocket Notes');

    // Settings lists it as installed, from its publication.
    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Tools and Moods');
    await expect(settings.getByTestId('installed-tools')).toContainText('Pocket Notes');
    await hidePane(page, 'Settings');

    // A Crux made from the installed tool, with the tool's own editor.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.locator('[data-template-id^="installed-"]').click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toHaveValue('', { timeout: 60_000 });
    await frame.getByLabel('Your note').fill('Made by account B');
    await frame.getByRole('button', { name: 'Save note' }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    recipientCruxId = (await page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    expect(recipientCruxId).not.toBe(toolCruxId);
    // The publisher's own note never travelled with the package.
    const meta = await storedCrux(page, recipientCruxId);
    expect(JSON.stringify(meta)).not.toContain('Publisher-only note');
    await page.screenshot({ path: info.outputPath('catalog-installed-crux.png') });
  } finally {
    await recipient.app.close();
  }

  // ── C: B restarts; the tool and the Crux are still there ──
  const restarted = await launchApp({
    ai: false,
    dir: recipient.dir,
    env: { CRUX_API_URL: api.url },
  });
  try {
    const { page } = restarted;
    await reenterWorkspace(page);
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      recipientCruxId,
    );
    await expect(page.frameLocator('iframe[data-crux-id]').getByLabel('Your note')).toHaveValue(
      'Made by account B',
      { timeout: 60_000 },
    );
    await goHome(page);
    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Tools and Moods');
    await expect(settings.getByTestId('installed-tools')).toContainText('Pocket Notes');
    await hidePane(page, 'Settings');
    const explore = await exploreTools(page);
    await expect(
      explore.getByTestId('explore-tool-pocket-notes').getByTestId('tool-installed'),
    ).toBeVisible({ timeout: 30_000 });
    // Still offered as a starting point after the restart.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await expect(page.locator('[data-template-id^="installed-"]')).toHaveCount(1);
  } finally {
    await restarted.app.close();
    await api.close();
  }
});
