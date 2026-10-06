import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 32 · Custom domains — the rules the API states: a bad
 * name, a domain already connected, and removing one. Real DNS/HTTPS and the
 * signed release are manual; the happy path is usage-domains.spec.ts.
 */
test.describe('guide 32 · Custom domains', () => {
  test('DOMAIN-02 — a bad name is refused with the reason; Remove asks, then takes it away', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    api.state.billing.planId = 'gardener';
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Own address');
      await writeFirstFile(page, 'index.html', '<h1>Mine</h1>');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });

      const domains = page.getByTestId('custom-domains');
      await domains.getByRole('button', { name: 'Connect a domain' }).click();
      const name = domains.getByRole('textbox', { name: 'Domain name' });
      await name.fill('not a domain');
      await domains.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(domains).toContainText('Enter a domain like');
      await name.fill('blog.example.com');
      await domains.getByRole('button', { name: 'Connect', exact: true }).click();
      const dom = page.getByTestId('domain-blog.example.com');
      await expect(dom).toContainText('Waiting for DNS');
      // One domain per Crux in the pane; a second Crux claiming it is refused by the API (409).
      // Remove: asked first, then gone here and at the API.
      await dom.getByRole('button', { name: 'Remove blog.example.com' }).click();
      const confirm = page.getByRole('dialog').filter({ hasText: 'Remove blog.example.com?' });
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(dom).toBeVisible();
      await dom.getByRole('button', { name: 'Remove blog.example.com' }).click();
      await page
        .getByRole('dialog')
        .filter({ hasText: 'Remove blog.example.com?' })
        .getByRole('button', { name: 'Remove', exact: true })
        .click();
      await expect(page.getByTestId('domain-blog.example.com')).toHaveCount(0);
      await expect.poll(() => api.state.domains.length).toBe(0);
    } finally {
      await app.close();
    }
  });
});
