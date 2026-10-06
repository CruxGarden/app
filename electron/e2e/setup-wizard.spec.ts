import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux } from './multi-crux-helpers';
import { showPane, chooseSettingsSection } from './panel-helpers';
import { openSetupWizard, skipSetupToHome } from './setup-helpers';

/**
 * The Setup wizard (ROADMAP § Setup wizard): first run by need → garden →
 * collaborators → Mood → "Here's your garden" → the first Crux, with a garden
 * that grows a stage per step. Skippable, cancelable and runnable again.
 */

const wizard = (page: Page) => page.getByTestId('setup-wizard');
/** The words ai-off.spec refuses: with No AI chosen, none may be on screen. */
const AI_WORDS = /\b(AI|collaborators?|Collaboration|agents?|Keeper|prompts?|persona)\b/;
const expectNoAiWords = async (page: Page) =>
  expect(await wizard(page).innerText()).not.toMatch(AI_WORDS);
const growth = (page: Page) => page.getByTestId('setup-garden-growth');
const accent = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
const workspaceCount = (page: Page) =>
  page.evaluate(async () => {
    const rows = (await window.electronAPI!.sqlite.all(
      "SELECT id FROM cruxes WHERE kind = 'webapp' AND deleted IS NULL",
    )) as { id: string }[];
    return rows.length;
  });

test.describe('Setup wizard', () => {
  test('the full path: a website, a name, No AI, a Mood, then Create & open with its walkthrough', async () => {
    test.setTimeout(5 * 60_000);
    const { app, page } = await launchApp();
    try {
      await openSetupWizard(page);
      await expect(wizard(page)).toHaveAttribute('data-step', 'need');
      await expect(growth(page)).toHaveAttribute('data-stage', '0');

      // 1 · What would you like to make?
      await expect(page.getByRole('radio', { name: /A home page or website/ })).toBeVisible();
      await page.getByText('A home page or website', { exact: true }).click();
      await expect(page.getByRole('radio', { name: /A home page or website/ })).toBeChecked();
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();

      // 2 · The garden grows; the name shows live in the Home header preview
      await expect(wizard(page)).toHaveAttribute('data-step', 'garden');
      await expect(growth(page)).toHaveAttribute('data-stage', '1');
      await page.getByLabel('Name your garden', { exact: true }).fill('Moss Hollow');
      await expect(page.getByTestId('setup-home-preview')).toContainText('Moss Hollow');
      // Folder and account sit behind More options
      await expect(page.getByRole('button', { name: 'Choose garden folder' })).toHaveCount(0);
      await page.getByRole('button', { name: /More options/ }).click();
      await expect(page.getByTestId('setup-garden-more')).toHaveAttribute('data-open', 'true');
      await expect(page.getByRole('button', { name: 'Choose garden folder' })).toBeVisible();
      // Enter continues from the name field
      await page.getByLabel('Name your garden', { exact: true }).press('Enter');

      // 3 · Collaborators: the plain choice first; developer options folded for a website
      await expect(wizard(page)).toHaveAttribute('data-step', 'ai');
      await expect(growth(page)).toHaveAttribute('data-stage', '2');
      await expect(page.getByTestId('setup-ai-developers')).toHaveAttribute('data-open', 'false');
      await expect(page.locator('[data-setup-section="collaborator"]')).toBeVisible();
      await expect(page.getByTestId('setup-status-collaborator')).not.toHaveText('Looking…', {
        timeout: 15_000,
      });
      await page.getByText('No AI', { exact: true }).click();
      await expect(page.getByRole('radio', { name: /^No AI/ })).toBeChecked();
      // Nothing about collaborators stays on screen
      await expect(page.locator('[data-setup-section]')).toHaveCount(0);
      await expect(page.getByTestId('setup-ai-developers')).toHaveCount(0);
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();

      // 4 · A Mood re-skins the wizard at once
      await expect(wizard(page)).toHaveAttribute('data-step', 'mood');
      await expectNoAiWords(page);
      await expect(growth(page)).toHaveAttribute('data-stage', '3');
      const before = await accent(page);
      await page.locator('[data-mood="parchment"]').click();
      await expect.poll(() => accent(page)).not.toBe(before);
      await expect(page.getByText(/Now wearing Parchment/)).toBeVisible();
      // The Gateway behind takes the Mood too
      await expect(page.getByTestId('gateway-mood-backdrop')).toHaveAttribute(
        'data-mood',
        'parchment',
      );
      await page.locator('[data-mood="night-city"]').click();
      await expect(page.getByTestId('gateway-mood-backdrop')).toHaveCSS(
        'background-image',
        /url\(/,
      );
      await page.locator('[data-mood="parchment"]').click();
      await wizard(page).getByRole('button', { name: 'Almost there', exact: true }).click();

      // 5 · Here's your garden, with Edit links, then Create & open
      await expect(wizard(page)).toHaveAttribute('data-step', 'crux');
      await expect(growth(page)).toHaveAttribute('data-stage', '4');
      const summary = page.getByTestId('setup-summary');
      await expect(summary.locator('[data-summary="need"]')).toHaveText('A home page or website');
      await expect(summary.locator('[data-summary="garden"]')).toContainText('Moss Hollow');
      await expect(summary.locator('[data-summary="ai"]')).toHaveText('By hand');
      await expectNoAiWords(page);
      await expect(summary.locator('[data-summary="mood"]')).toHaveText('Parchment');
      await expect(page.getByTestId('setup-starting-point')).toHaveAttribute(
        'data-template',
        'hello-world',
      );
      await wizard(page).getByRole('button', { name: 'Create & open', exact: true }).click();

      // The garden blooms, then the first home page opens with its own walkthrough
      await expect(page.getByTestId('setup-planted')).toBeVisible();
      await expect(growth(page)).toHaveAttribute('data-stage', '5');
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Your first home page', { exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Home page walkthrough' })).toBeVisible();
      // No AI took effect: no Collaboration pane
      await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('Skip setup from step 1 lands at Home with the defaults and makes nothing', async () => {
    const { app, page } = await launchApp();
    try {
      await skipSetupToHome(page);
      await expect(page.getByTestId('pane-body-home')).toBeVisible();
      expect(await workspaceCount(page)).toBe(0);
      await expect(page.getByText('Plant a new garden')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('Back from step 4 keeps the step-2 name; Edit from the summary returns to it', async () => {
    const { app, page } = await launchApp();
    try {
      await openSetupWizard(page);
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByLabel('Name your garden', { exact: true }).fill('Kept Name');
      await page.getByLabel('Username', { exact: true }).fill('river-moss');
      await expect(page.getByText('Lovely — that name works.')).toBeVisible();
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'mood');
      await wizard(page).getByRole('button', { name: 'Back', exact: true }).click();
      await wizard(page).getByRole('button', { name: 'Back', exact: true }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'garden');
      await expect(page.getByLabel('Name your garden', { exact: true })).toHaveValue('Kept Name');
      await expect(page.getByLabel('Username', { exact: true })).toHaveValue('river-moss');
      // The step list takes you back to a finished step
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Garden, done. Go back to it' }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'garden');
      // …and the summary's Edit comes back to the summary
      for (let i = 0; i < 3; i++)
        await wizard(page)
          .getByRole('button', { name: /^(Continue|Almost there)$/ })
          .click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'crux');
      await page.getByRole('button', { name: 'Edit garden' }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'garden');
      await wizard(page).getByRole('button', { name: 'Back to summary', exact: true }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'crux');
    } finally {
      await app.close();
    }
  });

  test('an app with a backend opens the developer options; Esc asks before skipping', async () => {
    const { app, page } = await launchApp();
    try {
      await openSetupWizard(page);
      await page.getByText('An app with a backend', { exact: true }).click();
      await page.getByRole('radio', { name: /An app with a backend/ }).press('Enter');
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'ai');
      await expect(page.getByTestId('setup-ai-developers')).toHaveAttribute('data-open', 'true');
      await expect(page.locator('[data-setup-section="agents"]')).toHaveAttribute(
        'data-open',
        'true',
      );
      await expect(page.getByTestId('setup-claude-code-status')).not.toHaveText('Looking…', {
        timeout: 20_000,
      });
      await expect(page.locator('[data-setup-section="outside"]')).toBeVisible();

      await page.keyboard.press('Escape');
      const confirm = page.getByRole('alertdialog', { name: 'Skip setup?' });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Keep going' }).click();
      await expect(confirm).toHaveCount(0);
      await expect(wizard(page)).toHaveAttribute('data-step', 'ai');
    } finally {
      await app.close();
    }
  });

  test('cancel midway plants nothing: the next launch still offers a new garden', async () => {
    const first = await launchApp();
    const dir = first.dir;
    try {
      const { page } = first;
      await openSetupWizard(page);
      await page.getByText('Music and sound', { exact: true }).click();
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByLabel('Name your garden', { exact: true }).fill('Not yet');
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(wizard(page)).toHaveAttribute('data-step', 'ai');
      for (let i = 0; i < 3; i++)
        await wizard(page).getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.getByText('Plant a new garden')).toBeVisible();
      // Coming back keeps the answers given so far
      await page.getByText('Plant a new garden').click();
      await expect(page.getByRole('radio', { name: /Music and sound/ })).toBeChecked();
    } finally {
      await first.app.close();
    }
    const again = await launchApp({ dir });
    try {
      await again.page
        .getByRole('button', { name: 'Enter', exact: true })
        .click({ timeout: 30_000 });
      await expect(again.page.getByText('Plant a new garden')).toBeVisible({ timeout: 30_000 });
    } finally {
      await again.app.close();
    }
  });

  test('Run setup again from Settings edits the garden and removes nothing', async () => {
    test.setTimeout(4 * 60_000);
    const { app, page } = await launchApp();
    try {
      await skipSetupToHome(page);
      await createCrux(page, 'Still here');
      const before = await workspaceCount(page);

      await showPane(page, 'Settings');
      await chooseSettingsSection(page, 'Garden and backups');
      await page.getByRole('button', { name: 'Run setup again', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Run setup again' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('setup-wizard')).toHaveAttribute('data-mode', 'again');
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(dialog.getByLabel('Name your garden', { exact: true })).toHaveValue('My Garden');
      await dialog.getByLabel('Name your garden', { exact: true }).fill('Renamed Garden');
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      await dialog.getByRole('button', { name: 'Almost there', exact: true }).click();
      // Running again keeps the first Crux folded away unless asked
      await expect(dialog.getByTestId('setup-starting-point')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText('Saved. Your garden is up to date.')).toBeVisible();

      expect(await workspaceCount(page)).toBe(before);
      await chooseSettingsSection(page, 'Appearance and panels');
      await expect(page.getByLabel('Garden title', { exact: true })).toHaveValue('Renamed Garden');
    } finally {
      await app.close();
    }
  });

  test('with reduced motion the garden grows in still stages', async () => {
    const { app, page } = await launchApp();
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openSetupWizard(page);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.motionIntensity))
        .toBe('off');
      await expect(growth(page)).toHaveAttribute('data-motion', 'still');
      await wizard(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(growth(page)).toHaveAttribute('data-stage', '1');
      // The sprout is fully there at once: no transition is running
      const sprout = growth(page).locator('g[data-shown="true"]').nth(1);
      await expect(sprout).toHaveCSS('opacity', '1');
      expect(await sprout.evaluate((g) => getComputedStyle(g).transitionProperty)).toBe('none');
      await skipSetupToHome(page);
    } finally {
      await app.close();
    }
  });
});
