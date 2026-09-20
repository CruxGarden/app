import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * The Order Desk template (CRUX-FUNCTIONS-PLAN's worked example): a crux
 * whose backend is its Store and functions, exercised in the workspace with
 * no API. Two orders take numbers from the atomic counter; the owner moves
 * one along; the rollup follows through crux.on; the page cannot write an
 * order directly (the Store hook refuses); the Share pane lists the seven
 * handlers and runs one by hand.
 */
test('Order Desk: orders are numbered, moved by the owner, summarised, and never written around the functions', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Order Desk/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();

    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Bloom & Ink', {
      timeout: 30_000,
    });
    await expect(frame.locator('#item option')).toHaveCount(4);
    await expect(frame.locator('#empty')).toBeVisible();

    // Two orders: #0001 and #0002, from the atomic counter.
    const form = frame.locator('#order-form');
    await form.getByLabel('Your name').fill('Ada');
    await form.getByLabel('Item').selectOption('A3 poster');
    await form.getByLabel('Quantity').fill('3');
    await form.getByRole('button', { name: 'Place order' }).click();
    await expect(frame.locator('#placed')).toContainText(
      'Order #0001 placed. 3 × A3 poster for Ada.',
    );
    await form.getByLabel('Your name').fill('Grace');
    await form.getByLabel('Item').selectOption('Sticker sheet');
    await form.getByLabel('Note').fill('by Friday');
    await form.getByRole('button', { name: 'Place order' }).click();
    await expect(frame.locator('#placed')).toContainText('Order #0002 placed.');
    const orders = frame.locator('#orders li');
    await expect(orders).toHaveCount(2);
    await expect(orders.nth(1)).toContainText('by Friday');
    await expect(frame.locator('#summary')).toHaveText('2 open · 2 total');

    // Validation is the function's, not only the form's: around the form, the answer is the same.
    const src = (await page.locator('iframe[data-crux-id]').getAttribute('src'))!;
    const preview = page.frames().find((f) => f.url().startsWith(src.split('?')[0]!))!;
    const tooMany = await preview.evaluate(() =>
      (window as unknown as { crux: { fn: (n: string, b: unknown) => Promise<unknown> } }).crux
        .fn('order', { name: 'Zed', item: 'A3 poster', qty: 99 })
        .then(
          () => 'placed',
          (e: Error) => e.message,
        ),
    );
    expect(tooMany).toBe('Quantity is 1 to 50.');
    await expect(orders).toHaveCount(2);

    // The owner moves #0001 along; the rollup follows.
    await orders.nth(0).getByRole('button', { name: 'Mark printing' }).click();
    await expect(orders.nth(0).locator('.status')).toHaveText('printing');
    await orders.nth(0).getByRole('button', { name: 'Mark ready' }).click();
    await orders.nth(0).getByRole('button', { name: 'Mark done' }).click();
    await expect(orders.nth(0).locator('.status')).toHaveText('done');
    await expect(orders.nth(0).getByRole('button')).toHaveCount(0);
    await expect(frame.locator('#summary')).toHaveText('1 open · 2 total');

    // The page cannot write an order around the functions.
    const refusal = await preview.evaluate(() =>
      (
        window as unknown as {
          crux: { store: { set: (k: string, v: unknown, o: unknown) => Promise<void> } };
        }
      ).crux.store
        .set('orders/0002', { id: '0002', status: 'done' }, { mode: 'public' })
        .then(
          () => 'allowed',
          (e: Error) => e.message,
        ),
    );
    expect(refusal).toBe('Orders are placed with crux.fn("order"), not written directly.');
    const still = await preview.evaluate(() =>
      (
        window as unknown as {
          crux: { fn: (n: string) => Promise<{ orders: { id: string; status: string }[] }> };
        }
      ).crux
        .fn('orders')
        .then((r) => r.orders.find((o) => o.id === '0002')!.status),
    );
    expect(still).toBe('new');

    // The Share pane knows the backend and runs a handler by hand.
    await page.getByRole('button', { name: 'Toggle share' }).click();
    const fns = page.getByTestId('functions-section');
    await expect(fns.getByTestId('functions-list').locator('li')).toHaveCount(7);
    await fns.getByTestId('function-orders').getByRole('button', { name: 'Run' }).click();
    await expect(fns.getByTestId('function-result-orders')).toContainText('"total": 2');
    await page.screenshot({ path: 'e2e/.results/order-desk.png' });
  } finally {
    await app.close();
  }
});
