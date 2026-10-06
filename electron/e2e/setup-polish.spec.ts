import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { openSetupWizard } from './setup-helpers';
import { storedCrux } from './multi-crux-helpers';

async function ready(page: Page, advanced = false) {
  const wizard = await openSetupWizard(page);
  await wizard.locator('[data-need="writing"]').click();
  await expect(wizard.getByTestId('setup-benefits')).toContainText('Write and organize notes');
  await expect(wizard.getByTestId('setup-benefits')).toBeInViewport();
  if (advanced) await wizard.getByRole('switch', { name: 'Advanced Mode', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('introduction-writing.png') });
  for (const step of ['need', 'garden', 'ai', 'mood']) {
    await expect(wizard).toHaveAttribute('data-step', step);
    await wizard
      .getByRole('button', { name: step === 'mood' ? 'Keep the default' : 'Later', exact: true })
      .click();
  }
  return wizard;
}

async function previewPanes(page: Page) {
  return page
    .locator('[data-preview-pane]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-preview-pane')));
}

test('the workspace preview follows the chosen tool and window, with Create always reachable', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1450, 850),
    );
    const wizard = await ready(page, true);
    await expect.poll(() => previewPanes(page)).toEqual(['workshop']);
    await wizard.getByLabel('Starting point', { exact: true }).selectOption('private-requests');
    await expect.poll(() => previewPanes(page)).toEqual(['artifacts', 'store', 'workshop']);
    await wizard.getByLabel('How would you like to start?', { exact: true }).selectOption('empty');
    await expect.poll(() => previewPanes(page)).toEqual(['workshop']);
    await wizard
      .getByLabel('How would you like to start?', { exact: true })
      .selectOption('template');
    await expect.poll(() => previewPanes(page)).toEqual(['artifacts', 'store', 'workshop']);
    await wizard.getByLabel('Name', { exact: true }).fill('My request app');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(820, 950),
    );
    await expect.poll(() => previewPanes(page)).toEqual(['workshop', 'artifacts']);
    await expect(wizard.locator('[data-preview-direction]').first()).toHaveAttribute(
      'data-preview-direction',
      'column',
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(820, 720),
    );
    await expect.poll(() => previewPanes(page)).toEqual(['workshop']);
    const create = wizard.getByRole('button', { name: 'Create & open', exact: true });
    const before = await create.boundingBox();
    expect(before!.y + before!.height).toBeLessThanOrEqual(720);
    await wizard.getByTestId('setup-ready-scroll').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const after = await create.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
    await page.screenshot({ path: test.info().outputPath('workspace-ready-narrow.png') });
    await create.click();
    const workshop = page.getByTestId('pane-body-workshop');
    const artifacts = page.getByTestId('pane-body-artifacts');
    await expect(workshop).toBeVisible({ timeout: 60_000 });
    await expect(artifacts).toHaveCount(0);
    await expect(page.getByTestId('pane-body-store')).toHaveCount(0);
    await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
    expect((await workshop.boundingBox())!.height).toBeGreaterThan(400);
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('heading', { name: 'Private Requests', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('workspace-open-narrow.png') });
  } finally {
    await app.close();
  }
});

test('a new Crux keeps room for its tool and resumes its own tutorial', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1000, 720),
    );
    const wizard = await ready(page);
    await wizard.getByRole('button', { name: 'Create & open', exact: true }).click();
    const guide = page.getByTestId('setup-project-guide');
    await expect(guide).toBeVisible({ timeout: 60_000 });
    await expect(
      page.frameLocator('iframe[data-crux-id]').getByLabel('Note title', { exact: true }),
    ).toHaveValue('Welcome');
    const workshop = (await page.getByTestId('pane-body-workshop').boundingBox())!;
    expect((await guide.boundingBox())!.height).toBeLessThanOrEqual(workshop.height * 0.4);
    expect((await page.locator('iframe[data-crux-id]').boundingBox())!.height).toBeGreaterThan(160);
    await guide.getByRole('button', { name: 'Next tip', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await expect.poll(async () => (await storedCrux(page, id)).setupGuide.step).toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(guide).toContainText('Step 2 of 3');
    await expect(
      guide.getByRole('button', { name: '2. Keep a version', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(
      page.frameLocator('iframe[data-crux-id]').getByLabel('Note title', { exact: true }),
    ).toHaveValue('Welcome');
    await page.screenshot({ path: test.info().outputPath('notebook-tutorial.png') });
    await guide.getByRole('button', { name: 'Next tip', exact: true }).click();
    await guide.getByRole('button', { name: 'Finish walkthrough', exact: true }).click();
    await expect.poll(async () => (await storedCrux(page, id)).setupGuide.dismissed).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(guide).not.toHaveAttribute('open');
    await guide.locator('summary').click();
    await expect(guide).toContainText('Step 3 of 3');
    await expect(guide.getByRole('button', { name: 'Open Share', exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
