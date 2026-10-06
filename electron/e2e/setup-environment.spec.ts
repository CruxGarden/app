import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { openSetupWizard } from './setup-helpers';
import { storedCrux } from './multi-crux-helpers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const scenario of [
  { need: 'writing', advanced: false, start: 'guided', width: 1000, panels: ['workshop'] },
  {
    need: 'app',
    advanced: true,
    start: 'template',
    width: 1500,
    panels: ['artifacts', 'store', 'workshop'],
  },
  { need: 'exploring', advanced: false, start: 'empty', width: 1000, panels: ['workshop'] },
  ...(['writing', 'music', 'art', 'game'] as const).flatMap((need) => [
    ...(need === 'writing'
      ? []
      : [{ need, advanced: false, start: 'guided', width: 1000, panels: ['workshop'] }]),
    { need, advanced: true, start: 'template', width: 1400, panels: ['workshop'] },
  ]),
  { need: 'app', advanced: false, start: 'guided', width: 1000, panels: ['workshop'] },
  {
    need: 'exploring',
    advanced: true,
    start: 'empty',
    width: 1400,
    panels: ['artifacts', 'workshop'],
  },
])
  test(`setup opens ${scenario.need} ${scenario.start} ${scenario.advanced ? 'advanced' : 'ordinary'} with appropriate panels`, async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp({ ai: false });
    try {
      await app.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 950),
        scenario.width,
      );
      const wizard = await openSetupWizard(page);
      await wizard.locator(`[data-need="${scenario.need}"]`).click();
      if (scenario.advanced)
        await wizard.getByRole('switch', { name: 'Advanced Mode', exact: true }).click();
      for (const step of ['need', 'garden', 'ai', 'mood']) {
        await expect(wizard).toHaveAttribute('data-step', step);
        await wizard
          .getByRole('button', {
            name: step === 'mood' ? 'Keep the default' : 'Later',
            exact: true,
          })
          .click();
      }
      await wizard
        .getByLabel('How would you like to start?', { exact: true })
        .selectOption(scenario.start);
      await wizard.getByLabel('Name', { exact: true }).fill('My first project');
      await wizard.getByRole('button', { name: 'Create & open', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90_000 });
      for (const pane of scenario.panels)
        await expect(page.getByTestId(`pane-body-${pane}`)).toBeVisible();
      for (const pane of ['collaboration', 'artifacts', 'store']) {
        if (!scenario.panels.includes(pane))
          await expect(page.getByTestId(`pane-body-${pane}`)).toHaveCount(0);
      }
      const workshop = await page.getByTestId('pane-body-workshop').boundingBox();
      expect(workshop!.width).toBeGreaterThan(scenario.width * 0.55);
      if (scenario.start === 'guided')
        await expect(page.getByTestId('setup-project-guide')).toBeVisible();
      else await expect(page.getByTestId('setup-project-guide')).toHaveCount(0);
      const frame = page.frameLocator('iframe[data-crux-id]');
      if (scenario.need === 'writing') {
        await expect(frame.getByLabel('Note title', { exact: true })).toHaveValue('Welcome', {
          timeout: 60_000,
        });
        await frame.locator('.tiptap').first().click();
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('My first wizard note.');
        await expect(frame.locator('.tiptap').first()).toContainText('My first wizard note.');
        const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
        const { projectFolder } = await storedCrux(page, id);
        await expect
          .poll(() => readFileSync(join(projectFolder, 'notebook/Welcome.md'), 'utf8'))
          .toContain('My first wizard note.');
      } else if (scenario.need === 'app') {
        await expect(
          frame.getByRole('heading', { name: 'Private Requests', exact: true }),
        ).toBeVisible({ timeout: 60_000 });
        await frame.getByLabel('Subject', { exact: true }).fill('My first request');
        await frame.getByLabel('Details', { exact: true }).fill('Made after setup.');
        await frame
          .locator('#request-form')
          .evaluate((form: HTMLFormElement) => form.requestSubmit());
        await expect(frame.locator('#inbox article')).toContainText('My first request');
      } else if (scenario.need === 'art' || scenario.need === 'music') {
        await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux', {
          timeout: 60_000,
        });
      } else if (scenario.need === 'game') {
        await expect(frame.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
      } else {
        await expect(page.getByRole('button', { name: 'Add files', exact: true })).toBeVisible();
      }
      await page.screenshot({
        path: test
          .info()
          .outputPath(
            `${scenario.need}-${scenario.start}-${scenario.advanced ? 'advanced' : 'ordinary'}.png`,
          ),
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
      if (scenario.start === 'guided')
        await expect(page.getByTestId('setup-project-guide')).toBeVisible();
      if (scenario.need === 'writing')
        await expect(
          page.frameLocator('iframe[data-crux-id]').locator('.tiptap').first(),
        ).toContainText('My first wizard note.', { timeout: 60_000 });
      if (scenario.need === 'app')
        await expect(
          page.frameLocator('iframe[data-crux-id]').locator('#inbox article'),
        ).toContainText('My first request', { timeout: 60_000 });
      if (scenario.need === 'writing' && scenario.start === 'guided') {
        const guide = page.getByTestId('setup-project-guide');
        await guide.getByRole('button', { name: '2. Keep a version', exact: true }).click();
        await guide.getByRole('button', { name: 'Open Growth', exact: true }).click();
        await expect(page.getByTestId('pane-body-history')).toBeVisible();
        await guide.getByRole('button', { name: 'Finish walkthrough', exact: true }).click();
        const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
        await expect.poll(async () => (await storedCrux(page, id)).setupGuide.dismissed).toBe(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(guide).toBeVisible();
        await expect(guide).not.toHaveAttribute('open');
      }
    } finally {
      await app.close();
    }
  });

test('setup offers hardware-ranked local models without starting a download', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    const wizard = await openSetupWizard(page);
    await wizard.getByRole('switch', { name: 'Advanced Mode', exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await wizard.getByRole('radio', { name: /^With a collaborator/ }).check();
    await wizard.getByRole('button', { name: /More options/ }).click();
    const local = wizard.locator('[data-setup-section="local"]');
    await local.getByRole('button', { name: /Set up/ }).click();
    const picker = local.getByLabel('What fits my computer?', { exact: true });
    await expect(picker.locator('option')).toHaveCount(4);
    await expect(local).toContainText('RAM');
    await picker.selectOption('qwen3:1.7b');
    await expect(picker).toHaveValue('qwen3:1.7b');
    await expect(local).toContainText('These are estimates');
    await page.screenshot({ path: test.info().outputPath('local-models.png') });
  } finally {
    await app.close();
  }
});
