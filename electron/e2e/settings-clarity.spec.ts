import { revealOptionsFor, enableAdvancedMode } from './panel-helpers';
import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux } from './multi-crux-helpers';
import { showPane, hidePane, chooseSettingsSection } from './panel-helpers';

async function captureSettingsAcceptance(page: Page, name: string) {
  const info = test.info();
  const result = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-testid="pane-body-settings"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const report = {
    scope: 'Settings pane',
    violations: result.violations,
    incomplete: result.incomplete,
    passes: result.passes.length,
  };
  const reportPath = info.outputPath(`${name}-axe.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await info.attach(`${name}-axe`, { path: reportPath, contentType: 'application/json' });
  await page.mouse.move(0, 0);
  const screenshot = info.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot });
  await info.attach(name, { path: screenshot, contentType: 'image/png' });
  expect(result.passes.length).toBeGreaterThan(0);
  expect.soft(result.violations, `${name}: Settings accessibility violations`).toEqual([]);
}

for (const mode of ['Light', 'Dark'] as const) {
  test(`Settings navigation adapts to the pane while keeping drafts and keyboard access in Glass ${mode}`, async () => {
    test.setTimeout(120_000);
    const { app, page } = await launchApp({ ai: false });
    try {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(1008, 700),
      );
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      await mood
        .getByTestId('material-material')
        .getByRole('button', { name: 'Glass', exact: true })
        .click();
      await mood
        .getByTestId('material-mode')
        .getByRole('button', { name: mode, exact: true })
        .click();
      await expect(
        mood.getByTestId('material-material').getByRole('button', { name: 'Glass', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        mood.getByTestId('material-mode').getByRole('button', { name: mode, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'glass');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode.toLowerCase()}\\b`));
      await hidePane(page, 'Mood');
      const settings = await showPane(page, 'Settings');
      const navigation = settings.getByRole('navigation', {
        name: 'Settings sections',
        exact: true,
      });
      const chooser = navigation.getByRole('combobox', { name: 'Settings section', exact: true });
      await expect(chooser).toBeVisible();
      await expect(chooser).toHaveValue('start');
      await expect(chooser.getByRole('option')).toHaveText([
        'Getting started',
        'Tools and Moods',
        'Account',
        'AI and agents',
        'Garden and backups',
        'Appearance and panels',
      ]);
      await expect(navigation.getByRole('button')).toHaveCount(1);
      const go = navigation.getByRole('button', { name: 'Go to selected section', exact: true });
      await chooser.focus();
      // CDP keys cannot drive macOS's native select popup (also reproduced in a
      // plain Electron <select>). Change the actual select, then exercise the
      // app's focus preservation and Tab/Enter navigation without that OS popup.
      await chooser.selectOption('library');
      await expect(chooser).toBeFocused();
      await expect(chooser).toHaveValue('library');
      await chooser.selectOption('account');
      await expect(chooser).toBeFocused();
      await expect(chooser).toHaveValue('account');
      const selectedLabel = await chooser.locator('option:checked').textContent();
      expect(selectedLabel).toBeTruthy();
      await page.keyboard.press('Tab');
      await expect(go).toBeFocused();
      await go.press('Enter');
      await expect(
        settings.getByRole('region', { name: selectedLabel!, exact: true }).first(),
      ).toBeFocused();

      await chooseSettingsSection(page, 'Appearance and panels');
      const appearance = settings.getByRole('region', {
        name: 'Appearance and panels',
        exact: true,
      });
      await expect(appearance).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        appearance.getByRole('button', { name: 'Customize appearance', exact: true }),
      ).toBeFocused();
      const draft = appearance.getByRole('textbox', {
        includeHidden: true,
        name: 'Workspace layout name',
        exact: true,
      });
      await revealOptionsFor(draft);
      await draft.fill('Unfinished layout');
      await chooseSettingsSection(page, 'Getting started');
      await expect(
        settings.getByRole('region', { name: 'Getting started', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        settings.getByRole('switch', { name: 'Advanced Mode', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(settings.getByLabel('What I want to make')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        settings.getByRole('switch', { name: 'Resume my last workspace on startup', exact: true }),
      ).toBeFocused();
      await chooseSettingsSection(page, 'Appearance and panels');
      await expect(draft).toHaveValue('Unfinished layout');
      await chooser.focus();
      await expect(chooser).toHaveValue('appearance');
      await expect(chooser).toBeFocused();
      await captureSettingsAcceptance(page, `settings-glass-${mode.toLowerCase()}-compact`);

      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
      );
      await page.getByRole('button', { name: 'Focus Settings', exact: true }).click();
      await expect(chooser).toBeHidden();
      await expect(navigation.getByRole('button')).toHaveCount(6);
      await expect(
        navigation.getByRole('button', { name: 'Appearance and panels', exact: true }),
      ).toHaveAttribute('aria-current', 'location');
      const start = navigation.getByRole('button', { name: 'Getting started', exact: true });
      await start.focus();
      await start.press('Enter');
      await expect(start).toHaveAttribute('aria-current', 'location');
      await expect(
        settings.getByRole('region', { name: 'Getting started', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        settings.getByRole('switch', { name: 'Advanced Mode', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(settings.getByLabel('What I want to make')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        settings.getByRole('switch', { name: 'Resume my last workspace on startup', exact: true }),
      ).toBeFocused();
      await chooseSettingsSection(page, 'Appearance and panels');
      await expect(draft).toHaveValue('Unfinished layout');
      const appearanceLink = navigation.getByRole('button', {
        name: 'Appearance and panels',
        exact: true,
      });
      await appearanceLink.focus();
      await expect(appearanceLink).toBeFocused();
      await expect(appearanceLink).toHaveAttribute('aria-current', 'location');
      await captureSettingsAcceptance(page, `settings-glass-${mode.toLowerCase()}-wide`);
      await appearanceLink.press('Enter');
      await expect(appearance).toBeFocused();
      await expect(draft).toHaveValue('Unfinished layout');
    } finally {
      await app.close();
    }
  });
}

test('appearance Settings lead to the Customizer while panel naming stays available', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1008, 700),
    );
    await enterGarden(page);
    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Appearance and panels');
    await expect(
      settings.getByRole('button', { name: 'Customize appearance', exact: true }),
    ).toBeInViewport();
    await expect(
      settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }),
    ).toBeHidden();
    const evidence = resolve(__dirname, '../../docs/settings-clarity');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, 'appearance.png') });
    await settings.getByText('Custom panel names', { exact: true }).click();
    await settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }).fill('Studio');
    await settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }).press('Enter');
    await settings.getByRole('button', { name: 'Customize appearance', exact: true }).click();
    const mood = page.getByRole('region', { name: 'Mood', exact: true });
    await expect(
      mood.getByRole('heading', { name: 'Theme Customizer', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    await hidePane(page, 'Mood');
    await expect(
      settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }),
    ).toHaveValue('Studio');
  } finally {
    await app.close();
  }
});

test('startup preferences agree between already-open workspaces', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await createCrux(page, 'First workspace');
    let settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Getting started');
    await expect(
      settings.getByRole('switch', { name: 'Resume my last workspace on startup' }),
    ).not.toBeChecked();
    await createCrux(page, 'Second workspace');
    settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Getting started');
    await settings.getByRole('switch', { name: 'Resume my last workspace on startup' }).click();
    await switchCrux(page, 'First workspace');
    settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Getting started');
    await expect(
      settings.getByRole('switch', { name: 'Resume my last workspace on startup' }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add panel' });
    await picker.getByRole('textbox', { name: 'Find a panel' }).fill('Share');
    await picker.getByRole('button', { name: 'Pin Share', exact: true }).click();
    await expect(
      page.locator('header').getByRole('button', { name: 'Toggle share', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await picker.getByRole('button', { name: 'Unpin Share', exact: true }).click();
    await expect(
      page.locator('header').getByRole('button', { name: 'Toggle share', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('AI Settings stay consistent when another open workspace changes the shared preference', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    const openAiSettings = async () => {
      const settings = await showPane(page, 'Settings');
      await chooseSettingsSection(page, 'AI and agents');
      const expand = settings.getByRole('button', { name: 'AI', exact: true });
      if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click();
      return settings.getByRole('region', { name: 'AI', exact: true });
    };

    // Metrics are an Advanced Mode control; keep the shared-setting assertion in that mode.
    await enableAdvancedMode(page);
    await createCrux(page, 'First AI workspace');
    let ai = await openAiSettings();
    await expect(ai.getByRole('switch', { name: 'Enable AI Tools' })).not.toBeChecked();
    await expect(ai.getByRole('link', { name: 'Anthropic', exact: true })).toHaveCount(0);
    await expect(ai.getByRole('heading', { name: 'Metrics', exact: true })).toHaveCount(0);

    // Leave the first workspace's Settings open while changing the app-wide choice elsewhere.
    await createCrux(page, 'Second AI workspace');
    ai = await openAiSettings();
    await expect(ai.getByRole('switch', { name: 'Enable AI Tools' })).not.toBeChecked();
    await ai.getByRole('switch', { name: 'Enable AI Tools' }).click();
    await expect(ai.getByRole('switch', { name: 'Enable AI Tools' })).toBeChecked();
    await expect(ai.getByRole('link', { name: 'Anthropic', exact: true })).toBeVisible();
    await expect(ai.getByRole('heading', { name: 'Metrics', exact: true })).toBeVisible();

    await switchCrux(page, 'First AI workspace');
    ai = await openAiSettings();
    await expect(ai.getByRole('switch', { name: 'Enable AI Tools' })).toBeChecked();
    await expect(ai.getByRole('link', { name: 'Anthropic', exact: true })).toBeVisible();
    await expect(ai.getByRole('heading', { name: 'Metrics', exact: true })).toBeVisible();

    await ai.getByRole('switch', { name: 'Enable AI Tools' }).click();
    await expect(ai.getByRole('switch', { name: 'Enable AI Tools' })).not.toBeChecked();
    await expect(ai.getByRole('link', { name: 'Anthropic', exact: true })).toHaveCount(0);
    await expect(ai.getByRole('heading', { name: 'Metrics', exact: true })).toHaveCount(0);

    await switchCrux(page, 'Second AI workspace');
    ai = await openAiSettings();
    await expect(ai.getByRole('switch', { name: 'Enable AI Tools' })).not.toBeChecked();
    await expect(ai.getByRole('link', { name: 'Anthropic', exact: true })).toHaveCount(0);
    await expect(ai.getByRole('heading', { name: 'Metrics', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});
