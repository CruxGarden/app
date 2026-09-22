import { expect, type Page, type Locator } from '@playwright/test';

/** Drive the actual closed-panel discovery UI; the bar contains open panels only. */
export async function togglePanel(
  page: Page,
  label: string,
  options?: Parameters<Locator['click']>[0],
) {
  const button = page.getByRole('button', { name: label, exact: true });
  if (!(await button.isVisible())) {
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Find a panel', exact: true })
      .fill(label.replace(/^Toggle /, ''));
  }
  await button.click(options);
}

/** Read the bar, without opening a discovery surface or changing the workspace. */
export async function panelPressed(page: Page, label: string) {
  return (await page
    .locator('header')
    .getByRole('button', { name: label, exact: true })
    .and(page.locator('[aria-pressed="true"]'))
    .isVisible())
    ? 'true'
    : 'false';
}

export async function expectPanelBarReady(page: Page) {
  await expect(page.getByRole('button', { name: 'Add panel', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}
