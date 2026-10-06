import { expect, type Page } from '@playwright/test';

/**
 * The Setup wizard (ROADMAP § Setup wizard) from the Gateway. These replace
 * the old single-panel setup ("Set up your garden", the walkthrough checkbox,
 * "Welcome" / "Make my home page"); specs adopt them one at a time.
 */

/** From the Gateway's first screen (or the Choose screen) into step 1 of the wizard. */
export async function openSetupWizard(page: Page) {
  const wizard = page.getByTestId('setup-wizard');
  if (await wizard.isVisible().catch(() => false)) return wizard;
  const plant = page.getByText('Plant a new garden');
  if (!(await plant.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
  }
  await plant.click();
  await expect(wizard).toBeVisible({ timeout: 30_000 });
  return wizard;
}

/**
 * The fast path every older journey needs: plant the garden with the defaults
 * (the Default Mood, no first Crux, AI as the launch knob set it) and wait for
 * Home. Works from the Gateway banner, the Choose screen or any wizard step.
 */
export async function skipSetupToHome(page: Page) {
  await openSetupWizard(page);
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

/**
 * The old "Make my home page" destination: the defaults everywhere, then the
 * first home page (hello-world, with its walkthrough) created and opened.
 */
export async function setupWithFirstHomePage(page: Page, name?: string) {
  await openSetupWizard(page);
  await page.getByText('A home page or website', { exact: true }).click();
  const wizard = page.getByTestId('setup-wizard');
  for (const step of ['need', 'garden', 'ai', 'mood']) {
    await expect(wizard).toHaveAttribute('data-step', step);
    await wizard
      .getByRole('button', {
        name: step === 'mood' ? 'Keep the default' : 'Later',
        exact: true,
      })
      .click();
  }
  await expect(wizard).toHaveAttribute('data-step', 'crux');
  await expect(page.getByTestId('setup-starting-point')).toHaveAttribute(
    'data-template',
    'hello-world',
  );
  if (name) await wizard.getByLabel('Name', { exact: true }).fill(name);
  await wizard.getByRole('button', { name: 'Create & open', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
}
