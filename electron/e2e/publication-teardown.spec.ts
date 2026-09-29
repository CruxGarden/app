import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { openPanel } from './panel-helpers';
import { fileText } from './content-helpers';
import { connectAccount, writeFirstFile } from './journeys/journey-helpers';

test('failed Unshare preserves published state and local content; retry removes the site and permits sharing again', async () => {
  test.setTimeout(120_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Keep my work');
    await writeFirstFile(page, 'index.html', '<h1>Still mine</h1>');
    const share = await openPanel(page, 'publish', 'Toggle share');
    await share.getByRole('button', { name: 'Share', exact: true }).click();
    await connectAccount(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Share without a backup' }).click();
    await expect(share.getByText('Up to date')).toBeVisible();
    const unshare = async () => {
      await share.getByRole('button', { name: 'Unshare', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Unshare this crux' })
        .getByRole('button', { name: 'Unshare', exact: true })
        .click();
    };
    api.state.failUnpublish = true;
    await unshare();
    await expect(share).toContainText('API request failed (500).');
    await expect(share.getByText('Shared', { exact: true })).toBeVisible();
    expect(api.state.published[id]).toBeDefined();
    expect(await fileText(page, id, 'index.html')).toBe('<h1>Still mine</h1>');
    api.state.failUnpublish = false;
    await unshare();
    await expect(share.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
    expect(api.state.published[id]).toBeUndefined();
    expect(await fileText(page, id, 'index.html')).toBe('<h1>Still mine</h1>');
    await share.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Share without a backup' }).click();
    await expect(share.getByText('Up to date')).toBeVisible();
    expect(api.state.published[id]).toBeDefined();
  } finally {
    await app.close();
    await api.close();
  }
});
