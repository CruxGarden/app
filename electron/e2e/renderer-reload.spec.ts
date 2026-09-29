import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

test('a full document reload reopens the active Task under its original Crux', async () => {
  test.setTimeout(60_000);
  let { app, page, dir } = await launchApp();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await enterGarden(page);
    const main = await createCrux(page, 'Reload garden');
    await (await newTaskButton(page)).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Retained Task');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const task = await page.locator('[data-workspace-id]').getAttribute('data-workspace-id');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', task!);
    await expect(page).toHaveURL(new RegExp(`/c/${main}\\?task=${task}`));
    await app.close();
    ({ app, page } = await launchApp({ dir }));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    await page.goto(new URL(`/c/${main}?task=${task}`, page.url()).href, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', task!);

    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  } finally {
    await test
      .info()
      .attach('renderer-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
    // A failed boot must not leave this isolated test app alive indefinitely.
    const deadline = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try {
      await app.close();
    } finally {
      clearTimeout(deadline);
    }
  }
});
