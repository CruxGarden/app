import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { closeWorkspace } from './journeys/journey-helpers';
import { enterGarden, createCrux, goHome } from './multi-crux-helpers';
import { openSetupWizard } from './setup-helpers';
import { showPane, hidePane, togglePanel, openPanel, chooseSettingsSection } from './panel-helpers';

// Host UI only: upstream editors and user-created previews need separate audits.
async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .setLegacyMode()
    .analyze();
  writeFileSync(test.info().outputPath(`${name}.json`), JSON.stringify(results, null, 2));
  await test.info().attach(`${name}.json`, {
    body: JSON.stringify(
      {
        violations: results.violations,
        incomplete: results.incomplete,
        passes: results.passes.length,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(results.passes.length).toBeGreaterThan(10);
  // axe leaves some reference checks as incomplete; resolve actual IDREF tokens ourselves.
  const brokenReferences = await page.evaluate(() => {
    const attributes = [
      'aria-labelledby',
      'aria-describedby',
      'aria-controls',
      'aria-activedescendant',
    ];
    return [...document.querySelectorAll<HTMLElement>(attributes.map((a) => `[${a}]`).join(','))]
      .filter((el) => !el.closest('[inert]') && el.getClientRects().length)
      .flatMap((el) =>
        attributes.flatMap((attribute) =>
          (el.getAttribute(attribute) ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .filter((id) => !document.getElementById(id))
            .map((id) => ({ attribute, id })),
        ),
      );
  });
  expect.soft(brokenReferences, `${name}: dangling ARIA references`).toEqual([]);
  expect
    .soft(
      results.incomplete.filter((rule) => rule.id === 'aria-prohibited-attr'),
      `${name}: labeled elements need supported roles`,
    )
    .toEqual([]);
  expect.soft(results.violations, `${name}: automated accessibility violations`).toEqual([]);
  console.log(
    JSON.stringify({
      name,
      passes: results.passes.length,
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    }),
  );
}

test('accessibility scan of entry, creation, Settings and workspace', async () => {
  test.setTimeout(240_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await expect(page.getByRole('button', { name: /enter/i })).toBeVisible();
    await scan(page, 'entry');
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByText('Plant a new garden')).toBeVisible();
    await scan(page, 'garden-choice');
    // The Setup wizard: every step is scanned, then "Go to Home instead" lands at Home
    // without a first Crux (the old setup panel's Welcome without walkthrough).
    const wizard = await openSetupWizard(page);
    for (const step of ['need', 'garden', 'ai', 'mood'] as const) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await scan(page, `garden-setup-${step}`);
      await wizard.getByRole('button', { name: /^(Continue|Preview my workspace)$/ }).click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'crux');
    await scan(page, 'garden-setup-crux');
    await wizard.getByRole('button', { name: 'Go to Home instead', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await scan(page, 'garden');
    await showPane(page, 'Explore');
    await scan(page, 'explore');
    await hidePane(page, 'Explore');
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Add Crux' })).toBeVisible();
    await scan(page, 'creation');
    await page.keyboard.press('Escape');
    await showPane(page, 'Settings');
    for (const name of [
      'Getting started',
      'Tools and Moods',
      'Account',
      'AI and agents',
      'Garden and backups',
      'Appearance and panels',
    ] as const) {
      await chooseSettingsSection(page, name);
      const section = page.getByRole('region', { name, exact: true }).first();
      const folded = section.locator('button[aria-expanded="false"]');
      while (await folded.count()) await folded.first().click();
      await scan(page, `settings-${name}`);
    }
    await hidePane(page, 'Settings');
    await createCrux(page, 'Accessible workspace');
    await scan(page, 'workspace');
    await page.getByTestId('workspace-status').locator('summary').click();
    await scan(page, 'work-status-expanded');
    await page.getByTestId('workspace-status').locator('summary').click();
    await page.getByTestId('model-selector').click();
    await scan(page, 'models');
    await page.keyboard.press('Escape');
    for (const [type, label] of [
      ['tasks', 'Toggle tasks'],
      ['publish', 'Toggle share'],
      ['history', 'Toggle growth'],
    ]) {
      await openPanel(page, type, label);
      await scan(page, label);
      await togglePanel(page, label);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setContentSize(1200, 800);
      window.webContents.setZoomFactor(2);
    });
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await scan(page, 'zoomed-command-palette');
    const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage())
        .toPNG()
        .toString('base64'),
    );
    writeFileSync(test.info().outputPath('zoomed.png'), Buffer.from(screenshot, 'base64'));
  } finally {
    await app.close();
    await api.close();
  }
});

test('modal keyboard stays inside and returns to its opener', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    const opener = page.getByRole('button', { name: 'Add Crux', exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add Crux' });
    await expect(dialog.getByLabel('What do you want to make?')).toBeFocused();
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    // A programmatic focus request behind a modal cannot steal the keyboard.
    await opener.evaluate((el: HTMLElement) => el.focus());
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
    await expect(opener).toBeFocused();
  } finally {
    await app.close();
  }
});

test('model chooser supports keyboard selection, dismissal and announced selection', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Keyboard models');
    const trigger = page.getByTestId('model-selector');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: 'Choose a model' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('button', { pressed: true })).toBeFocused();
    await page.keyboard.press('Home');
    const first = picker.locator('button:enabled').first();
    await expect(first).toBeFocused();
    const label = await first.innerText();
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText(label);
    await page.keyboard.press('Enter');
    await expect(picker.getByRole('button', { pressed: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally {
    await app.close();
  }
});

test('invalid connection fields expose the error and recover after editing', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await showPane(page, 'Settings');
    await page.getByText('Advanced connection settings', { exact: true }).click();
    const address = page.getByRole('textbox', { name: 'API address' });
    await address.fill('not a url');
    await page.getByRole('button', { name: 'Use this address', exact: true }).click();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    const description = await address.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${description}"]`)).toHaveAttribute('role', 'alert');
    await expect(address).toHaveAccessibleDescription(/Enter an http or https address/);
    await address.fill('http://localhost:3001');
    await page.getByRole('button', { name: 'Use this address', exact: true }).click();
    await expect(address).not.toHaveAttribute('aria-invalid', 'true');
  } finally {
    await app.close();
  }
});

test('an import error owns focus above the creation dialog and Escape closes one layer', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const creation = page.getByRole('dialog', { name: 'Add Crux' });
    await creation.locator('input[type="file"][accept*=".crux"]').setInputFiles({
      name: 'damaged.crux',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a package'),
    });
    const error = page.getByRole('alertdialog', { name: 'Import failed' });
    await expect(error).toBeVisible();
    await expect(error.getByRole('button', { name: 'OK', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await error.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(error).toHaveCount(0);
    await expect(creation).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await creation.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(creation).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  } finally {
    await app.close();
  }
});

test('destructive confirmation defaults to Cancel and keeps the saved Mood', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await showPane(page, 'Mood');
    await scan(page, 'moods');
    await page.getByRole('button', { name: 'Save current as Mood' }).click();
    await page.getByRole('textbox', { name: 'Mood name' }).fill('Keep this Mood');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const remove = page.getByRole('button', { name: 'Delete Mood Keep this Mood', exact: true });
    await remove.click();
    const dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('button', { name: 'Delete locally', exact: true }) });
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await scan(page, 'delete-confirmation');
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeVisible();
  } finally {
    await app.close();
  }
});

test('creation remains usable with reduced motion at 200 percent zoom', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setContentSize(1200, 800);
      window.webContents.setZoomFactor(2);
    });
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Crux' });
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeInViewport();
    await dialog.getByLabel('What do you want to make?').fill('Zoomed project');
    const bounds = await dialog.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        x: box.x,
        y: box.y,
        right: box.right,
        bottom: box.bottom,
      };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
    const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage())
        .toPNG()
        .toString('base64'),
    );
    writeFileSync(test.info().outputPath('zoomed-creation.png'), Buffer.from(screenshot, 'base64'));
    writeFileSync(test.info().outputPath('zoomed-bounds.json'), JSON.stringify(bounds));
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('keyboard focus keeps Undo available past the notification timeout', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await createCrux(page, 'Undo with keyboard');
    await goHome(page);
    await closeWorkspace(page, 'Undo with keyboard');
    const card = page.getByRole('button', { name: 'Open Undo with keyboard' }).locator('..');
    await card.getByRole('button', { name: 'Crux actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const undo = page.getByTestId('toast').getByRole('button', { name: 'Undo', exact: true });
    await undo.focus();
    // Exercise real elapsed time; pointer enter/leave must not unpause focused controls.
    await undo.hover();
    await page.mouse.move(1, 1);
    await page.waitForTimeout(9_000);
    await expect(undo).toBeFocused({ timeout: 1000 });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Open Undo with keyboard' })).toBeVisible();
  } finally {
    await app.close();
  }
});
