import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Garden crumb reveals ancestry without leaving the Crux and history restores the shallow route', async () => {
  test.setTimeout(90_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    const { page } = instance;
    await enterGarden(page);
    const rootId = new URL(page.url()).searchParams.get('garden')!;
    for (const title of ['Music', 'Low Tide']) {
      await page.getByRole('button', { name: 'New Garden', exact: true }).click();
      await page.getByRole('textbox', { name: 'Garden name' }).fill(title);
      await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    }
    const project = await createCrux(page, 'Rough mix');
    const location = page.url();
    const crumb = page.getByRole('button', { name: 'Garden location', exact: true });
    await expect(crumb).toBeVisible({ timeout: 3_000 });
    await crumb.click();
    const sheet = page.getByRole('dialog', { name: 'Garden location', exact: true });
    await expect(
      sheet.getByRole('navigation', { name: 'Garden ancestry' }).getByRole('button'),
    ).toHaveText(['My Garden', 'Music', 'Low Tide']);
    expect(page.url()).toBe(location);
    await expect(page.locator(`[data-workspace-id="${project}"]`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(crumb).toBeFocused();
    await crumb.click();
    await sheet.getByRole('button', { name: 'My Garden', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Open Music', exact: true })).toBeVisible();
    await page.goBack();
    await expect(crumb).toHaveText('Low Tide');
    await expect(page.locator(`[data-workspace-id="${project}"]`)).toBeVisible();
    expect(page.url()).toBe(location);
    // Corrupt only this disposable profile to prove a failed read has a visible,
    // usable recovery path; normal API admission refuses this cycle.
    const cycleId = await page.evaluate(
      async ({ rootId, childId }) => {
        const id = crypto.randomUUID();
        await window.electronAPI!.sqlite.run(
          "INSERT INTO dimensions (id, source_id, target_id, type, kind, home_id, author_id, created, updated) SELECT ?, ?, ?, 'garden', 'membership', home_id, author_id, created, updated FROM cruxes WHERE id = ?",
          [id, childId, rootId, rootId],
        );
        return id;
      },
      { rootId, childId: new URL(location).searchParams.get('garden')! },
    );
    await crumb.click();
    await expect(sheet.getByRole('alert')).toContainText('cycle');
    await page.evaluate(
      (id) => window.electronAPI!.sqlite.run('DELETE FROM dimensions WHERE id = ?', [id]),
      cycleId,
    );
    await sheet.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      sheet.getByRole('navigation', { name: 'Garden ancestry' }).getByRole('button'),
    ).toHaveText(['My Garden', 'Music', 'Low Tide']);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(crumb).toBeFocused();
    await page.setViewportSize({ width: 480, height: 720 });
    await crumb.click();
    await expect(sheet).toBeInViewport();
    await expect(sheet.getByRole('button', { name: 'My Garden', exact: true })).toBeInViewport();
    await page.screenshot({ path: 'e2e/.results/garden-location-narrow.png' });
    await sheet.getByRole('button', { name: 'Close crux', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Rough mix', exact: true })).toBeVisible();
    await expect(crumb).toHaveText('Low Tide');
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    for (const title of ['Music', 'Low Tide'])
      await instance.page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
    await instance.page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await expect(
      instance.page.getByRole('navigation', { name: 'Garden ancestry' }).getByRole('button'),
    ).toHaveText(['My Garden', 'Music', 'Low Tide']);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
