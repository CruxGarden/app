import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, goHome } from './multi-crux-helpers';
import { showPane, hidePane, chooseSettingsSection } from './panel-helpers';
import { closeWorkspace } from './journeys/journey-helpers';

test('returning users can resume, find installed packages, and opt back into the welcome page', async () => {
  const first = await launchApp({ ai: false });
  let id = '';
  try {
    await enterGarden(first.page);
    const settings = await showPane(first.page, 'Settings');
    await chooseSettingsSection(first.page, 'Tools and Moods');
    await expect(settings.getByTestId('installed-tools')).toBeVisible();
    await settings.getByRole('button', { name: 'Manage my Moods', exact: true }).click();
    await expect(first.page.getByRole('region', { name: 'Mood', exact: true })).toBeVisible();
    await hidePane(first.page, 'Mood');
    await hidePane(first.page, 'Settings');
    id = await createCrux(first.page, 'My return project');
    const preferences = await showPane(first.page, 'Settings');
    await chooseSettingsSection(first.page, 'Getting started');
    await preferences.getByRole('switch', { name: 'Resume my last workspace on startup' }).click();
    await hidePane(first.page, 'Settings');
    await goHome(first.page);
    await expect(first.page.getByRole('heading', { name: 'Continue working' })).toBeVisible();
    await first.page.getByRole('link', { name: 'My return project', exact: true }).click();
    await expect(first.page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      id,
    );
  } finally {
    await first.app.close();
  }
  const again = await launchApp({ dir: first.dir, ai: false });
  try {
    await expect(again.page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      id,
      { timeout: 30000 },
    );
    const settings = await showPane(again.page, 'Settings');
    await chooseSettingsSection(again.page, 'Getting started');
    await settings.getByRole('switch', { name: 'Resume my last workspace on startup' }).click();
  } finally {
    await again.app.close();
  }
  const welcome = await launchApp({ dir: first.dir, ai: false });
  try {
    await expect(welcome.page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible();
  } finally {
    await welcome.app.close();
  }
});

test('resume falls back to Home after the last workspace is closed', async () => {
  const first = await launchApp({ ai: false });
  try {
    await enterGarden(first.page);
    await createCrux(first.page, 'Finished for today');
    const settings = await showPane(first.page, 'Settings');
    await chooseSettingsSection(first.page, 'Getting started');
    await settings.getByRole('switch', { name: 'Resume my last workspace on startup' }).click();
    await hidePane(first.page, 'Settings');
    await closeWorkspace(first.page, 'Finished for today');
    await expect(first.page.getByTestId('pane-body-home')).toBeVisible();
  } finally {
    await first.app.close();
  }
  const again = await launchApp({ dir: first.dir, ai: false });
  try {
    await expect(again.page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30000 });
    await expect(again.page.locator('[data-workspace-id]')).toHaveCount(0);
    await expect(again.page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
  } finally {
    await again.app.close();
  }
});
