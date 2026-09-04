import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * ADR 0011 in the app: after publishing, the Share pane shows this crux's
 * storage/bandwidth for the period, lets you connect a custom domain (two DNS
 * records → Verify → issuing → live), and Settings shows account-wide usage.
 */
test.describe('usage + custom domains (mocked API)', () => {
  test.setTimeout(150_000);

  test('publish → usage meters → connect a domain → live → settings usage', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Hello domain</h1>');
      await page.keyboard.press('Meta+s');

      // Connect + publish through the Share pane
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });

      // Usage for this crux
      const usage = page.getByTestId('crux-usage');
      await expect(usage).toBeVisible({ timeout: 30_000 });
      await expect(usage.getByRole('progressbar', { name: 'Storage used' })).toBeVisible();
      await expect(usage).toContainText('1 file');
      const publishedId = Object.keys(api.state.published)[0]!;
      expect(api.state.published[publishedId]![0]!.bytes.length).toBeGreaterThan(0);
      await expect(usage).not.toContainText('Storage0 B');
      await expect(usage).toContainText(/Bandwidth/);

      // Custom domain: add → records → verify ×3 → live
      const domains = page.getByTestId('custom-domains');
      await domains.getByRole('button', { name: 'Connect a domain' }).click();
      await domains.getByRole('textbox', { name: 'Domain name' }).fill('not a domain');
      await domains.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(domains).toContainText('Enter a domain like');
      await domains.getByRole('textbox', { name: 'Domain name' }).fill('blog.example.com');
      await domains.getByRole('button', { name: 'Connect', exact: true }).click();
      const dom = page.getByTestId('domain-blog.example.com');
      await expect(dom).toContainText('Waiting for DNS');
      await expect(dom).toContainText('_crux-verify.blog.example.com');
      await expect(dom).toContainText('publish.crux.garden');
      await dom.getByRole('button', { name: 'Verify blog.example.com' }).click();
      await expect(dom).toContainText('Waiting for the TXT record');
      await dom.getByRole('button', { name: 'Verify blog.example.com' }).click();
      await expect(dom).toContainText('Issuing certificate');
      await dom.getByRole('button', { name: 'Verify blog.example.com' }).click();
      await expect(dom).toContainText('Live');
      await expect(dom.getByRole('link', { name: 'https://blog.example.com' })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/usage-domains-1-share.png' });
      expect(api.log.some((l) => l.startsWith('POST /cruxes/') && l.includes('/domains'))).toBe(
        true,
      );

      // Settings → Sync: push the garden (metered by the mock), then Usage shows it
      api.state.sync.cruxes['11111111-1111-4111-8111-111111111111'] = {
        bytes: 2048,
        title: 'Synced Notes',
        slug: 'synced-notes',
        updatedAt: new Date().toISOString(),
      };
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.getByRole('button', { name: /^Sync/ }).click();
      await page.getByRole('button', { name: 'Push garden' }).click();
      await expect(page.getByText(/Last pushed:/)).toBeVisible({ timeout: 30_000 });
      expect(api.state.sync.garden?.bytes ?? 0).toBeGreaterThan(0);

      const settings = page.getByTestId('usage-settings');
      await expect(settings).toBeVisible();
      await expect(settings.getByRole('heading', { name: 'Usage' })).toBeVisible();
      await expect(settings).toContainText('Free plan');
      await expect(settings).toContainText(/1(\.00)? GB/);
      await expect(settings).toContainText('My Crux');
      const syncUsage = settings.getByTestId('sync-usage');
      await expect(syncUsage).toContainText('Garden backup');
      await expect(syncUsage).toContainText(/pushed/);
      await expect(syncUsage).toContainText('1 · 2.0 KB');
      await expect(syncUsage).not.toContainText('↑ 0 B');
      await expect(settings.getByTestId('past-periods')).toContainText('Aug 1 → Sep 1');
      await expect(settings.getByTestId('settlement-note')).toContainText(
        'settle 48 hours after the period ends · checked against CloudFront: matches',
      );
      await page.screenshot({ path: 'e2e/.results/usage-domains-2-settings.png' });
      await page.keyboard.press('Escape');

      // Remove the domain
      await dom.getByRole('button', { name: 'Remove blog.example.com' }).click();
      await expect(page.getByTestId('domain-blog.example.com')).toHaveCount(0);
    } finally {
      await app.close();
      await api.close();
    }
  });
});
