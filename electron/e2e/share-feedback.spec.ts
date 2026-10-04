import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { openPanel, togglePanel } from './panel-helpers';
import { writeFirstFile, connectAccount } from './journeys/journey-helpers';

test('sharing visibility distinguishes a saved preference from the online listing and retries failures', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Listing review');
    await writeFirstFile(page, 'index.html', '<h1>My page</h1>');
    const share = await openPanel(page, 'publish', 'Toggle share');
    const visibility = share.getByRole('switch', { name: 'Discoverable', exact: true });
    await visibility.click();
    await expect(share).toContainText('Will appear in Explore when you share.');
    await expect
      .poll(
        async () =>
          await page.evaluate(async (id) => {
            const row = (await window.electronAPI!.sqlite.get(
              'SELECT discoverable FROM cruxes WHERE id = ?',
              [id],
            )) as { discoverable: number };
            return !!row.discoverable;
          }, id),
      )
      .toBe(true);
    await share.getByRole('button', { name: 'Share', exact: true }).click();
    await connectAccount(page);
    await page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' })
      .getByRole('button', { name: 'Share without a backup' })
      .click();
    await expect(share).toContainText('Up to date', { timeout: 30000 });
    await expect(share).toContainText('Listed in Explore on crux.garden.');
    await page.route(`${api.url}/cruxes/${id}`, async (route) => {
      if (route.request().method() === 'PATCH')
        await route.fulfill({ status: 503, json: { message: 'Listing service unavailable' } });
      else await route.continue();
    });
    await visibility.click();
    await expect(share.getByRole('alert')).toContainText(
      'Your preference is saved here, but the online listing update is not confirmed.',
    );
    await expect
      .poll(
        async () =>
          await page.evaluate(async (id) => {
            const row = (await window.electronAPI!.sqlite.get(
              'SELECT discoverable FROM cruxes WHERE id = ?',
              [id],
            )) as { discoverable: number };
            return !!row.discoverable;
          }, id),
      )
      .toBe(false);
    expect(api.state.cruxes[id].discoverable).toBe(true);
    await page.screenshot({ path: test.info().outputPath('listing-retry.png') });
    await page.unroute(`${api.url}/cruxes/${id}`);
    // Reopening verifies online truth instead of forgetting a failed update.
    await togglePanel(page, 'Toggle share');
    await openPanel(page, 'publish', 'Toggle share');
    await expect(share).toContainText('Your saved preference differs from the online listing.');
    await share.getByRole('button', { name: 'Retry listing update' }).click();
    await expect(share).toContainText('Not listed in Explore. Anyone with the link can view it.');
    expect(api.state.cruxes[id].discoverable).toBe(false);
  } finally {
    await app.close();
    await api.close();
  }
});

test('unshare refuses an incomplete impact review and domain loading offers recovery', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Safe unshare');
    await writeFirstFile(page, 'index.html', '<h1>Still online</h1>');
    const share = await openPanel(page, 'publish', 'Toggle share');
    await page.route(`${api.url}/cruxes/${id}/domains`, (route) =>
      route.fulfill({ status: 503, json: { message: 'Domain service unavailable' } }),
    );
    await share.getByRole('button', { name: 'Share', exact: true }).click();
    await connectAccount(page);
    await page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' })
      .getByRole('button', { name: 'Share without a backup' })
      .click();
    await expect(share).toContainText('Up to date', { timeout: 30000 });
    const published = api.state.published[id].map((file) => ({
      ...file,
      bytes: Buffer.from(file.bytes),
    }));
    expect(published.some((file) => file.path === 'index.html')).toBe(true);
    await expect(share.getByTestId('custom-domains')).toContainText('Could not load your domains.');
    await share.getByRole('button', { name: 'Unshare', exact: true }).click();
    await expect(share).toContainText(
      'Could not review the domains and visitor data affected. Nothing was unshared. Try again.',
    );
    await expect(page.getByRole('dialog', { name: 'Unshare this crux' })).toHaveCount(0);
    expect(api.state.published[id]).toEqual(published);
    await page.unroute(`${api.url}/cruxes/${id}/domains`);
    await share.getByRole('button', { name: 'Retry loading domains' }).click();
    await expect(share.getByTestId('custom-domains')).not.toContainText(
      'Could not load your domains.',
    );
    await share.getByRole('button', { name: 'Unshare', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Unshare this crux' });
    await expect(review).toContainText('Takes the site offline. Your files and history stay here.');
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(api.state.published[id]).toEqual(published);
  } finally {
    await app.close();
    await api.close();
  }
});
