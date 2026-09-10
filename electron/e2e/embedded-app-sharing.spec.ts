import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden } from './multi-crux-helpers';

async function connectForSharing(page: Page) {
  await page.getByPlaceholder('email@example.com').fill('tester@example.com');
  await page.getByRole('button', { name: 'Send Code', exact: true }).click();
  await page.getByPlaceholder('Enter code').fill('123456');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}
async function shareWithoutBackup(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
  await dialog.getByRole('button', { name: 'Share without a backup', exact: true }).click();
}

test('Notes Share uploads only selected saved content; failed updates retain the last edition and can be retried', async () => {
  test.setTimeout(240000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Shared field journal');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 120000,
    });
    await frame.getByLabel('New note', { exact: true }).fill('Private research');
    await frame.getByRole('button', { name: 'Create note', exact: true }).click();
    const editor = frame.locator('.tiptap[contenteditable=true]').first();
    await editor.fill('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    await frame.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(frame.getByRole('status')).toContainText('Saved');
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Share selected content', exact: true })
      .click();
    const share = page.getByTestId('pane-body-publish');
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await connectForSharing(page);
    await shareWithoutBackup(page);
    await expect(share.getByRole('alert')).toContainText('Select at least one note');
    expect(api.state.published[id]).toBeUndefined();

    await frame.getByRole('button', { name: /Welcome$/ }).click();
    await frame.getByLabel('Include in public edition').check();
    await expect(frame.getByRole('status')).toContainText('Saved');
    // No Save click: Share must flush the rich editor before building/uploading.
    await editor.fill('The first public edition has a freshly written opening.');
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 60000 });
    const uploaded = () =>
      (api.state.published[id] ?? []).map((file) => file.bytes.toString('utf8')).join('\n');
    expect(uploaded()).toContain('freshly written opening');
    expect(uploaded()).not.toContain('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    expect(
      api.state.published[id]!.some(
        (file) => /^(notebook|src)\//.test(file.path) || file.path === 'preview.jpg',
      ),
    ).toBe(false);
    expect(api.state.cruxes[id]!.meta).toMatchObject({ messages: [] });
    const first = uploaded();
    const firstVersion = api.state.publishedVersion;

    api.state.failPublish = true;
    await editor.fill('The revised public edition includes a lantern in the woods.');
    await frame.getByRole('button', { name: 'Save now', exact: true }).click();
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByRole('alert')).toContainText('Simulated outage', { timeout: 60000 });
    expect(uploaded()).toBe(first);
    expect(api.state.publishedVersion).toBe(firstVersion);
    await expect(editor).toContainText('lantern in the woods');
    await expect(
      share.getByRole('button', { name: 'Update shared content', exact: true }),
    ).toBeEnabled();

    api.state.failPublish = false;
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 60000 });
    expect(uploaded()).toContain('lantern in the woods');
    expect(uploaded()).not.toContain('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    expect(api.state.publishedVersion).toBe(firstVersion + 1);
    await expect(share.getByRole('alert')).toHaveCount(0);
    // Local private content remains available after every Share attempt.
    await frame.getByRole('button', { name: /Private research$/ }).click();
    await expect(editor).toContainText('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
  } finally {
    await app.close();
    await api.close();
  }
});

test('Moqira Share replaces the public selection while retaining excluded frames locally', async () => {
  test.setTimeout(240000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Mockups/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Selected prototype');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByRole('status')).toHaveText('Saved', { timeout: 120000 });
    const addButton = async (text: string) => {
      await frame.locator('.library-item').getByText('Button', { exact: true }).click();
      await frame.locator('.canvas-node').dblclick();
      const input = frame.locator('.floating-text-editor textarea');
      await input.fill(text);
      await input.press('ControlOrMeta+Enter');
      await expect(frame.locator('.canvas-node')).toContainText(text);
    };
    await addButton('Original public prototype');
    await frame.getByLabel('Include in public edition').check();
    await expect(frame.getByRole('status')).toHaveText('Saved');
    await frame.getByRole('button', { name: 'Add wireframe', exact: true }).click();
    await addButton('Private alternative prototype');
    await expect(frame.getByLabel('Include in public edition')).not.toBeChecked();
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Share selected content', exact: true })
      .click();
    const share = page.getByTestId('pane-body-publish');
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await connectForSharing(page);
    await shareWithoutBackup(page);
    await expect(share.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 60000 });
    const uploaded = () =>
      (api.state.published[id] ?? []).map((file) => file.bytes.toString('utf8')).join('\n');
    expect(uploaded()).toContain('Original public prototype');
    expect(uploaded()).not.toContain('Private alternative prototype');
    expect(
      api.state.published[id]!.some(
        (file) => /^(mockups|src)\//.test(file.path) || file.path === 'preview.jpg',
      ),
    ).toBe(false);
    expect(api.state.cruxes[id]!.meta).toMatchObject({ messages: [] });

    await frame.getByLabel('Include in public edition').check();
    await expect(frame.getByRole('status')).toHaveText('Saved');
    await frame.getByRole('button', { name: /Wireframe 1/ }).click();
    await frame.getByLabel('Include in public edition').uncheck();
    await expect(frame.getByRole('status')).toHaveText('Saved');
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 60000 });
    expect(uploaded()).toContain('Private alternative prototype');
    expect(uploaded()).not.toContain('Original public prototype');
    await expect(frame.locator('.canvas-node')).toContainText('Original public prototype');

    await frame.getByRole('button', { name: /Wireframe 2/ }).click();
    await frame.getByLabel('Include in public edition').uncheck();
    await expect(frame.getByRole('status')).toHaveText('Saved');
    const previousEdition = uploaded();
    const previousVersion = api.state.publishedVersion;
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByRole('alert')).toContainText('Select at least one wireframe');
    expect(uploaded()).toBe(previousEdition);
    expect(api.state.publishedVersion).toBe(previousVersion);
    await expect(frame.locator('.canvas-node')).toContainText('Private alternative prototype');
  } finally {
    await app.close();
    await api.close();
  }
});
