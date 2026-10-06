import { showPane, chooseSettingsSection } from './panel-helpers';
import { indexedFiles, fileText } from './content-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { reenterWorkspace } from './multi-crux-helpers';

test('a subscriber signs in with no keys, creates with included AI and keeps the work after restart', async ({}, info) => {
  const api = await startMockApi();
  api.state.billing.planId = 'gardener';
  const env = { CRUX_API_URL: api.url, CRUX_AI_MOCK: '0' };
  let { app, page, dir } = await launchApp({ ai: false, env });
  try {
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByPlaceholder('email@example.com').fill('subscriber@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText('Included with your plan', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: /Include a first home page walkthrough/ }).uncheck();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blank/ }).click();
    await page.getByLabel('What do you want to make?').fill('Make a simple home page');
    await page.getByPlaceholder('My Crux').fill('Subscriber first creation');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const workspace = page.locator('[data-workspace-id]');
    await expect(workspace).toBeVisible();
    const cruxId = (await workspace.getAttribute('data-workspace-id'))!;
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue('Make a simple home page');
    await expect(page.getByPlaceholder('Send a message...')).toBeFocused();
    await expect(
      page.getByText('Your idea is ready. Press Enter or choose Send to start with AI.'),
    ).toBeVisible();
    expect(api.state.includedMessages ?? []).toHaveLength(0);
    await expect(
      page.getByText('Working on: Subscriber first creation', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('model-selector')).toContainText('Included collaborator');
    await expect(page.getByTestId('included-status')).toContainText('no API key needed');
    await page.getByPlaceholder('Send a message...').fill('Make a simple home page');
    await page.getByPlaceholder('Send a message...').press('Enter');
    await expect(page.getByText('Your included creation is ready.', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    expect(api.state.includedMessages?.length).toBe(2);
    expect(api.state.includedMessages?.every((m) => m.model === 'garden-included')).toBe(true);
    await expect
      .poll(() => fileText(page, cruxId, 'index.html'))
      .toBe('<h1>Made with included AI</h1>');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible({
      timeout: 30000,
    });
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Make a banner');
    await composer.press('Enter');
    await expect.poll(async () => (await indexedFiles(page, cruxId))['banner.png']).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible({
      timeout: 30000,
    });
    const original = (await indexedFiles(page, cruxId))['banner.png'];
    expect(api.state.includedImages?.length).toBe(1);
    await composer.fill('Make the background lighter');
    await composer.press('Enter');
    await expect
      .poll(async () => (await indexedFiles(page, cruxId))['banner.png'])
      .not.toBe(original);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible({
      timeout: 30000,
    });
    expect(api.state.includedImages?.length).toBe(2);
    expect(api.state.includedImages?.[1]?.image).toBeTruthy();
    const edited = (await indexedFiles(page, cruxId))['banner.png'];
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('heading', { name: 'Made with included AI' }),
    ).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: info.outputPath('subscriber-first-result.png') });
    await app.close();
    ({ app, page } = await launchApp({ dir, ai: false, env }));
    await reenterWorkspace(page, 'Subscriber first creation');
    await expect(page.getByTestId('model-selector')).toContainText('Included collaborator');
    await expect(
      page.getByText('Your included creation is ready.', { exact: true }).first(),
    ).toBeVisible();
    expect((await indexedFiles(page, cruxId))['banner.png']).toBe(edited);
    expect(await fileText(page, cruxId, 'index.html')).toBe('<h1>Made with included AI</h1>');
    api.state.failIncludedUsage = true;
    await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
    await expect(page.getByTestId('included-status')).toContainText(
      'Can’t check included collaboration',
    );
    await expect(page.getByTestId('model-selector')).toContainText('Included collaborator');
    api.state.failIncludedUsage = false;
    api.state.includedUsagePercent = 100;
    await page.getByTestId('included-status').getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('included-status')).toContainText('allowance reached');
    await expect(page.getByTestId('included-status')).toContainText('Your work stays here');
  } finally {
    await info.attach('included-http-requests', {
      body: JSON.stringify({
        messages: api.state.includedMessages,
        images: api.state.includedImages,
      }),
      contentType: 'application/json',
    });
    await app.close();
    await api.close();
  }
});

test('an explicit manual-only choice survives paid sign-in, refresh and restart', async () => {
  const api = await startMockApi();
  api.state.billing.planId = 'gardener';
  const env = { CRUX_API_URL: api.url, CRUX_AI_MOCK: '0' };
  let { app, page, dir } = await launchApp({ ai: false, env });
  try {
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: /AI collaborator/ }).click();
    const toggle = page.getByRole('switch', { name: 'Enable AI Tools' });
    await toggle.click();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.getByRole('button', { name: /Connect to crux.garden/ }).click();
    await page.getByPlaceholder('email@example.com').fill('manual-subscriber@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: /AI collaborator/ }).click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByTestId('included-status')).toContainText('no API key needed');
    await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
    await expect(toggle).not.toBeChecked();
    await page.getByRole('checkbox', { name: /Include a first home page walkthrough/ }).uncheck();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await app.close();
    ({ app, page } = await launchApp({ dir, ai: false, env }));
    await page.getByRole('button', { name: /enter/i }).click();
    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'AI and agents');
    const expand = settings.getByRole('button', { name: 'AI', exact: true });
    if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click();
    await expect(settings.getByRole('switch', { name: 'Enable AI Tools' })).not.toBeChecked();
    expect(api.state.includedMessages ?? []).toHaveLength(0);
    expect(api.state.includedImages ?? []).toHaveLength(0);
  } finally {
    await app.close();
    await api.close();
  }
});
