import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

async function history(page: Page) {
  const pane = page.getByTestId('pane-body-history');
  if (!(await pane.isVisible())) await page.getByRole('button', { name: 'Toggle history' }).click();
  await expect(pane).toBeVisible();
  return pane;
}
async function newTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const row = (await page.evaluate(
    async (id) =>
      window.electronAPI!.sqlite.get('SELECT project_folder FROM working_copies WHERE id = ?', [
        id,
      ]),
    id,
  )) as { project_folder: string };
  return { id, folder: row.project_folder };
}
async function checkpoint(
  page: Page,
  copy: { id: string; folder: string },
  content: string,
  label: string,
) {
  // The caller waits for the full AI turn, including verification, before editing on disk.
  writeFileSync(join(copy.folder, 'index.html'), content);
  const fingerprint = createHash('sha256').update(content).digest('hex');
  await expect
    .poll(async () => {
      const row = (await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = 'index.html'",
            [id],
          ),
        copy.id,
      )) as { fingerprint: string } | undefined;
      return row?.fingerprint;
    })
    .toBe(fingerprint);
  const collaboration = page.getByRole('button', { name: 'Toggle collaboration' });
  if ((await collaboration.getAttribute('aria-pressed')) === 'true') await collaboration.click();
  const pane = await history(page);
  await pane.getByRole('button', { name: 'Take snapshot', exact: true }).click();
  await pane.getByPlaceholder('Label (optional)').fill(label);
  await pane.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pane.getByText(label, { exact: true })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Take snapshot', exact: true })).toBeEnabled();
}

test('Whole Crux Growth explores merged and independent Tasks in 2D and 3D without changing files', async () => {
  test.setTimeout(180000);
  let { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await enterGarden(page);
    const main = await createCrux(page, 'A website taking shape');
    const meta = await storedCrux(page, main);
    writeFileSync(join(meta.projectFolder, 'index.html'), '<h1>Our starting point</h1>');
    const checkout = await newTask(page, 'Checkout');
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('[workspace:Checkout]');
    await input.press('Enter');
    await expect(page.getByText('Completed workspace Checkout.', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('turn-job')).toHaveCount(0, {
      timeout: 30000,
    });
    await checkpoint(page, checkout, '<h1>Checkout first draft</h1>', 'Checkout first draft');
    await checkpoint(page, checkout, '<h1>Checkout ready</h1>', 'Checkout polished');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    const experiment = await newTask(page, 'Homepage experiment');
    await checkpoint(page, experiment, '<h1>An alternative homepage</h1>', 'A different direction');
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /^Checkout/ })
      .click();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await review.getByRole('button', { name: 'Check combined result' }).click();
    await expect(review.getByRole('checkbox')).toBeEnabled();
    await review.getByRole('checkbox').check();
    await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    const pane = await history(page);
    const open = pane.getByRole('button', { name: 'Whole Crux · branches & merges' });
    await open.click();
    const graph = page.getByRole('dialog', { name: 'Whole Crux Growth' });
    await expect(graph).toBeVisible();
    await expect(
      graph.getByRole('button', { name: 'Checkout · merged', exact: true }),
    ).toBeVisible();
    await expect(graph.getByTestId('growth-canvas-2d').locator('canvas')).toBeVisible();
    // A canvas can have a box yet be clipped by a transformed pane ancestor.
    await expect
      .poll(async () =>
        graph
          .getByTestId('growth-canvas-2d')
          .locator('canvas')
          .evaluate((canvas) => {
            const box = canvas.getBoundingClientRect();
            return (
              box.width > innerWidth / 2 &&
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === canvas
            );
          }),
      )
      .toBe(true);
    await graph.getByRole('button', { name: 'Expand checkpoints', exact: true }).click();
    await graph.getByLabel('Find checkpoint').fill('Merged Checkout');
    await graph
      .getByRole('button', { name: 'Merged Checkout Main · Merge checkpoint', exact: true })
      .click();
    const inspector = graph.getByTestId('growth-inspector');
    await expect(inspector.getByText('Brought together', { exact: true })).toBeVisible();
    await expect(
      inspector.getByText('Completed workspace Checkout.', { exact: false }),
    ).toBeVisible();
    await graph.getByLabel('Checkpoint Artifact').selectOption({ label: 'index.html' });
    await expect(inspector.locator('pre')).toContainText('<h1>Checkout ready</h1>');
    await graph.getByLabel('Find checkpoint').fill('');
    await graph.getByRole('button', { name: 'Fit graph', exact: true }).click();
    await page.screenshot({ path: '/private/tmp/crux-growth-graph-2d.png' });
    await graph.getByRole('button', { name: 'Explore in 3D', exact: true }).click();
    await expect(graph.getByTestId('growth-canvas-3d').locator('canvas')).toBeVisible({
      timeout: 30000,
    });
    await expect(
      graph.getByText('The graph renderer is unavailable.', { exact: false }),
    ).toHaveCount(0);
    // Visual QA only: let the 100 ms setup and 400 ms camera transition finish.
    await page.waitForTimeout(650);
    await page.screenshot({ path: '/private/tmp/crux-growth-graph-3d.png' });
    await graph.getByRole('button', { name: '2D lanes', exact: true }).click();
    await graph.getByLabel('Find checkpoint').fill('A different direction');
    await graph
      .getByRole('button', {
        name: 'A different direction Homepage experiment · Checkpoint',
        exact: true,
      })
      .click();
    await graph.getByLabel('Checkpoint Artifact').selectOption({ label: 'index.html' });
    await expect(inspector.locator('pre')).toContainText('An alternative homepage');
    await page.keyboard.press('Escape');
    await expect(graph).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(readFileSync(join(meta.projectFolder, 'index.html'), 'utf8')).toBe(
      '<h1>Checkout ready</h1>',
    );
    expect(readFileSync(join(experiment.folder, 'index.html'), 'utf8')).toBe(
      '<h1>An alternative homepage</h1>',
    );
    expect(errors).toEqual([]);
    await app.close();
    ({ app, page } = await launchApp({ dir }));
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.goto(`crux-app://app/c/${main}?task=${experiment.id}`);
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      experiment.id,
    );
    await (await history(page))
      .getByRole('button', { name: 'Whole Crux · branches & merges' })
      .click();
    await expect(
      page
        .getByRole('dialog', { name: 'Whole Crux Growth' })
        .getByRole('button', { name: 'Checkout · merged', exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('an empty Crux has a browsable endpoint and graph dialog traps keyboard focus', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'A fresh start');
    await (await history(page))
      .getByRole('button', { name: 'Whole Crux · branches & merges' })
      .click();
    const graph = page.getByRole('dialog', { name: 'Whole Crux Growth' });
    await expect(
      graph.getByText('0 checkpoints · 0 Tasks · branches and merges preserved'),
    ).toBeVisible();
    await expect(graph).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      graph.getByRole('button', { name: 'Main Main · Working Copy', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(graph.getByRole('button', { name: '2D lanes', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(graph).toHaveCount(0);
  } finally {
    await app.close();
  }
});
