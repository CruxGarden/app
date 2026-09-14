import { expect, type Page } from '@playwright/test';

/**
 * Open the Builder ("Edit content") of the open Site Crux. After a restart or
 * an import the Workshop may be closed (the layout comes back as it was), and
 * right after the workspace mounts its toolbar may not be there yet: wait for
 * the pane, open it once if it is missing, then press the button.
 */
export async function openBuilder(page: Page) {
  const edit = page.getByRole('button', { name: 'Edit content', exact: true });
  const workshop = page.getByTestId('workshop-view');
  const deadline = Date.now() + 60_000;
  let toggled = false;
  while (Date.now() < deadline) {
    if (await edit.isVisible().catch(() => false)) break;
    if (!toggled && !(await workshop.isVisible().catch(() => false))) {
      await page.waitForTimeout(1500);
      if (await workshop.isVisible().catch(() => false)) continue;
      await page.getByRole('button', { name: 'Toggle workshop' }).click();
      toggled = true;
    }
    await page.waitForTimeout(300);
  }
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
}
