import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, reenterWorkspace, goHome } from './multi-crux-helpers';
import { showPane, chooseSettingsSection, togglePanel } from './panel-helpers';
import { openSetupWizard, skipSetupToHome, setupWithFirstHomePage } from './setup-helpers';

async function settings(page: Page) {
  await showPane(page, 'Settings');
  await chooseSettingsSection(page, 'Getting started');
  return page.getByRole('switch', { name: 'Advanced Mode', exact: true });
}

async function storeOffered(page: Page, offered: boolean) {
  await page.getByRole('button', { name: 'Add panel', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add panel' });
  await expect(picker.getByRole('button', { name: 'Toggle store', exact: true })).toHaveCount(
    offered ? 1 : 0,
  );
  await picker.getByRole('textbox', { name: 'Find a panel' }).press('Escape');
}

test('Advanced Mode starts the first-project guide folded, with guidance still available', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await openSetupWizard(page);
    await page.getByRole('switch', { name: 'Advanced Mode', exact: true }).click();
    await setupWithFirstHomePage(page);
    await expect(
      page.getByTestId('workshop-view').getByRole('button', { name: 'Advanced', exact: true }),
    ).toBeVisible();
    const guide = page.getByRole('navigation', { name: 'Home page walkthrough' });
    await expect(guide).toBeHidden();
    await page.getByText('Your first home page', { exact: true }).click();
    await expect(guide).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Edit my home page', exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('Advanced Mode changes actual controls with AI off, preserves work, and survives restart', async () => {
  test.setTimeout(180_000);
  const first = await launchApp({ ai: false });
  try {
    const { page } = first;
    await skipSetupToHome(page);
    await createCrux(page, 'Kept in either mode');
    const workshop = page.getByTestId('workshop-view');
    await expect(workshop.getByRole('button', { name: 'Advanced', exact: true })).toHaveCount(0);
    await storeOffered(page, false);
    await expect(await settings(page)).not.toBeChecked();
    await page.getByLabel('What I want to make').selectOption('writing');
    await (await settings(page)).click();
    await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
    await expect(workshop.getByRole('button', { name: 'Advanced', exact: true })).toBeVisible();
    await storeOffered(page, true);
    await togglePanel(page, 'Toggle store');
    await expect(page.getByTestId('pane-body-store')).toBeVisible();
    await (await settings(page)).click();
    // Existing panels and editor state are retained; only discovery changes.
    await expect(page.getByTestId('pane-body-store')).toBeVisible();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    await storeOffered(page, false);
    await (await settings(page)).click();
    await expect(await settings(page)).toBeChecked();
    await page.screenshot({ path: '/tmp/crux-advanced-mode-oct6.png' });
  } finally {
    await first.app.close();
  }
  const again = await launchApp({ dir: first.dir, ai: false });
  try {
    const { page } = again;
    await reenterWorkspace(page, 'Kept in either mode');
    await expect(await settings(page)).toBeChecked();
    await expect(page.getByLabel('What I want to make')).toHaveValue('writing');
    await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
    await storeOffered(page, true);
    await goHome(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Add Crux' });
    await expect(modal.getByRole('heading', { name: 'Suggested for you' })).toBeVisible();
    await expect(modal.locator('[data-template-id]').first()).toHaveAttribute(
      'data-template-id',
      'notes',
    );
    await expect(modal.locator('[data-template-id="hello-world"]')).toBeVisible();
  } finally {
    await again.app.close();
  }
});

test('an app interest keeps setup simple until Advanced Mode is chosen; cancel does not save it', async () => {
  const { app, page } = await launchApp();
  try {
    await openSetupWizard(page);
    const wizard = page.getByTestId('setup-wizard');
    await expect(wizard.getByRole('switch', { name: 'Advanced Mode' })).not.toBeChecked();
    await page.getByText('An app with a backend', { exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('[data-setup-section="collaborator"]')).toBeVisible();
    await expect(page.getByTestId('setup-ai-developers')).toHaveCount(0);
    await wizard.getByRole('button', { name: 'Back', exact: true }).click();
    await wizard.getByRole('button', { name: 'Back', exact: true }).click();
    await wizard.getByRole('switch', { name: 'Advanced Mode' }).click();
    await wizard.getByRole('button', { name: 'Skip setup', exact: true }).click();
    await expect(await settings(page)).toBeChecked();
    await chooseSettingsSection(page, 'Garden and backups');
    await page.getByRole('button', { name: 'Garden', exact: true }).click();
    await page.getByRole('button', { name: 'Run setup again', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Run setup again' });
    await dialog.getByRole('switch', { name: 'Advanced Mode' }).click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(await settings(page)).toBeChecked();
  } finally {
    await app.close();
  }
});
