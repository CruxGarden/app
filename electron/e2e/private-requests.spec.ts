import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, reenterWorkspace } from './multi-crux-helpers';

test('Private Requests keeps a private draft, saves one record, and lets the local owner handle it after restart', async () => {
  let running = await launchApp({ ai: false });
  try {
    let { page } = running;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Private Requests/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    let frame = page.frameLocator('iframe[data-crux-id]');
    await expect(
      frame.getByRole('heading', { name: 'Private Requests', exact: true }),
    ).toBeVisible();
    await expect(frame.getByText('Workspace preview', { exact: false })).toBeVisible();
    await frame.getByLabel('Subject', { exact: true }).fill('A private commission');
    await frame.getByLabel('Details', { exact: true }).fill('A small illustration for my study.');
    const form = frame.locator('#request-form');
    await form.evaluate((f: HTMLFormElement) => {
      f.requestSubmit();
      f.requestSubmit();
    });
    await expect(frame.getByRole('status')).toContainText('Request saved.');
    await expect(frame.locator('#inbox article')).toHaveCount(1);
    await expect(frame.locator('#inbox article')).toContainText('A private commission');
    // The normal preview SDK exposes only this visitor's protected record, not a public value.
    const entries = await page
      .locator('iframe[data-crux-id]')
      .evaluate(async (el: HTMLIFrameElement) => el.src);
    const preview = page.frames().find((f) => f.url() === entries)!;
    const rows = await preview.evaluate(async () => (window as any).crux.store.list());
    expect(rows.filter((r: { key: string }) => r.key.startsWith('requests/'))).toMatchObject([
      { mode: 'protected' },
    ]);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    // Imported customer rows are genuine native Store slots, not a mocked Function response.
    await page.evaluate(async (cruxId) => {
      await window.electronAPI!.sqlite.installation!.storeSet({
        cruxId,
        key: 'requests/customer-b',
        visitorId: 'customer-b',
        mode: 'protected',
        value: JSON.stringify({ subject: 'Customer B', details: 'Another private commission' }),
      });
    }, id);
    await running.app.close();
    running = await launchApp({ dir: running.dir, ai: false });
    page = running.page;
    await reenterWorkspace(page, 'My Private Requests');
    frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Subject', { exact: true })).toHaveValue('A private commission');
    await expect(frame.locator('#inbox article')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('private-owner.png') });
    const customer = frame.locator('#inbox article').filter({ hasText: 'Customer B' });
    await customer.getByRole('button', { name: 'Delete handled request', exact: true }).click();
    await customer.getByRole('button', { name: 'Keep request', exact: true }).click();
    await expect(frame.locator('#inbox article')).toHaveCount(2);
    await customer.getByRole('button', { name: 'Delete handled request', exact: true }).click();
    await customer.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await expect(customer).toHaveCount(0);
    await expect(frame.locator('#inbox article')).toHaveCount(1);
    await expect(frame.getByLabel('Subject', { exact: true })).toHaveValue('A private commission');
    await frame.getByRole('button', { name: 'Delete handled request', exact: true }).click();
    await expect(frame.getByRole('button', { name: 'Confirm delete', exact: true })).toBeVisible();
    await frame.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await expect(frame.locator('#inbox article')).toHaveCount(0);
    await expect(frame.getByRole('status')).toContainText('Request deleted.');
  } finally {
    await running.app.close();
  }
});
