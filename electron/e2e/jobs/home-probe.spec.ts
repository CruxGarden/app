import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { startMockApi } from '../api-mock';

/** Can a person leave a Notes crux for Home? Opt-in. */
test.skip(!process.env.CRUX_HOME_PROBE, 'set CRUX_HOME_PROBE=1');
test('home from a Notes crux', async () => {
  test.setTimeout(180_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  await page.setViewportSize({ width: 2000, height: 1200 });
  const lines: string[] = [];
  page.on('console', (m) => lines.push(`${m.type()} ${m.text().slice(0, 160)}`));
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved', { timeout: 120_000 });
    console.log('url on crux:', page.url());
    // As the journey does: type a line in the app, then a labelled snapshot from History.
    const editor = frame.locator('.cm-content, [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(' A line from the probe.');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved', { timeout: 60_000 });
    if (!(await page.getByTestId('pane-body-history').isVisible().catch(() => false)))
      await page.getByRole('button', { name: 'Toggle history' }).click();
    const history = page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Brief');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('Brief', { exact: true })).toBeVisible({ timeout: 30_000 });
    console.log('snapshot taken');
    // A second Notes crux while the first stays open (the journey keeps seven open).
    await page.locator('header').getByRole('button').first().click();
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByPlaceholder('My Crux').fill('Second').catch(() => {});
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved', { timeout: 120_000 });
    console.log('second open:', page.url());
    await page.locator('header').getByRole('button').first().click();
    await page.waitForTimeout(3000);
    console.log('url after home click:', page.url());
    console.log('console tail:\n' + lines.filter((l) => /flush|block|navig|notebook|error/i.test(l)).slice(-12).join('\n'));
    await page.screenshot({ path: 'e2e/.results/home-probe.png' });
    await expect(page.getByRole('button', { name: 'Create Cruxspace', exact: true })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
  }
});
