import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux, reenterWorkspace } from './multi-crux-helpers';
import { startMockApi } from './api-mock';
import { showPane, openPanel } from './panel-helpers';

async function add(page: Page, template: string) {
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  await page
    .getByLabel('Find a starting point')
    .fill(template === 'tool-starter' ? 'Make a tool' : 'Pocket Notes');
  await page.locator(`[data-template-id="${template}"]`).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('iframe[data-crux-id]')).toBeVisible();
}

test('a creator exports an unknown .cruxtool and a clean recipient installs, edits and restarts', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const api = await startMockApi();
  const publisher = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  const toolFile = testInfo.outputPath('pocket-notes.cruxtool');
  try {
    await enterGarden(publisher.page);
    await add(publisher.page, 'tool-starter');
    const frame = publisher.page.frameLocator('iframe[data-crux-id]');
    await frame.getByLabel('Your note').fill('Author-only test note');
    await frame.getByRole('button', { name: 'Save note' }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    await openPanel(publisher.page, 'details', 'Toggle details');
    const badge = publisher.page.getByRole('button', {
      name: /^(auto|Web App|Page|Document|Image|Tool template)$/i,
    });
    for (let i = 0; i < 8 && !/Tool template/i.test(await badge.innerText()); i++)
      await badge.click();
    await expect(badge).toHaveText('Tool template');
    await openPanel(publisher.page, 'export', 'Toggle export');
    await publisher.app.evaluate(({ session }, path) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
    }, toolFile);
    await publisher.page
      .getByRole('button', { name: 'Export Tool (.cruxtool)', exact: true })
      .click();
    await expect.poll(() => existsSync(toolFile)).toBe(true);
    await openPanel(publisher.page, 'publish', 'Toggle share');
    await publisher.page.getByRole('button', { name: 'Share', exact: true }).click();
    await publisher.page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await publisher.page.getByRole('button', { name: 'Send Code' }).click();
    await publisher.page.getByPlaceholder('Enter code').fill('123456');
    await publisher.page.getByRole('button', { name: 'Connect', exact: true }).click();
    const backup = publisher.page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' });
    await expect(backup).toBeVisible();
    await backup.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(publisher.page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
    await publisher.page.getByRole('switch', { name: 'Discoverable' }).click();
    await expect
      .poll(() =>
        Object.values(api.state.cruxes).some(
          (crux) => crux.kind === 'tool' && crux.discoverable === true,
        ),
      )
      .toBe(true);
  } finally {
    await publisher.app.close();
  }

  const recipient = await launchApp({ ai: false });
  try {
    await enterGarden(recipient.page);
    await recipient.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const dialog = recipient.page.getByRole('dialog', { name: 'Add Crux', exact: true });
    await dialog.locator('input[type=file][accept*=".cruxtool"]').setInputFiles(toolFile);
    await expect(recipient.page.getByRole('alertdialog', { name: 'Tool installed' })).toBeVisible();
    await recipient.page.getByRole('button', { name: 'OK', exact: true }).click();
    await recipient.page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = recipient.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Your note')).toHaveValue('');
    await frame.getByLabel('Your note').fill('Made by the recipient');
    await frame.getByRole('button', { name: 'Save note' }).click();
    await expect(frame.getByRole('status')).toHaveText('Saved to Garden');
    const id = (await recipient.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(recipient.page, id)).projectFolder;
    expect(JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).text).toBe(
      'Made by the recipient',
    );
    await recipient.page.screenshot({ path: testInfo.outputPath('installed-tool.png') });
  } finally {
    await recipient.app.close();
  }
  const restarted = await launchApp({ ai: false, dir: recipient.dir });
  try {
    await reenterWorkspace(restarted.page);
    await expect(
      restarted.page.frameLocator('iframe[data-crux-id]').getByLabel('Your note'),
    ).toHaveValue('Made by the recipient');
  } finally {
    await restarted.app.close();
  }
  const online = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(online.page);
    await showPane(online.page, 'Explore');
    await online.page
      .getByRole('region', { name: 'Explore', exact: true })
      .getByRole('tab', { name: 'Tools', exact: true })
      .click();
    const card = online.page.getByTestId('explore-tool-pocket-notes');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(card.getByTestId('tool-installed')).toBeVisible();
    await online.page.keyboard.press('Escape');
    await online.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await online.page.locator('[data-template-id^="installed-"]').click();
    await online.page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(
      online.page.frameLocator('iframe[data-crux-id]').getByLabel('Your note'),
    ).toHaveValue('');
  } finally {
    await online.app.close();
    await api.close();
  }
});
