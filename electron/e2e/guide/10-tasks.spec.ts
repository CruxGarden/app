import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel, newTaskButton } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 10 · Tasks — publication belongs to Main, overlapping
 * Tasks and the conflict choices, the blocking states. Task creation,
 * review and merge are parallel-tasks and task-* specs.
 */
async function newTask(page: Page, title: string) {
  await (await newTaskButton(page)).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
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

/** Write a Task's index.html on disk (as any editor would) and wait for the tree to see it. */
async function writeHeading(page: Page, folder: string, heading: string) {
  writeFileSync(join(folder, 'index.html'), `<h1>${heading}</h1>`);
  const tree = await openPanel(page, 'artifacts', 'Toggle artifacts');
  await expect(tree.getByRole('tree').getByText('index.html', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

const taskLink = (page: Page, title: string) =>
  page.getByTestId('task-bar').getByRole('link', { name: new RegExp(`^${title}`) });

test.describe('guide 10 · Tasks', () => {
  test('TASK-06 — two Tasks change the same file: the review says both changed, and Main ends up as chosen — nothing lost', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const main = await createCrux(page, 'Overlap');
      const mainFolder = (await storedCrux(page, main)).projectFolder as string;
      await writeHeading(page, mainFolder, 'Main');
      const redesign = await newTask(page, 'Redesign');
      await writeHeading(page, redesign.folder, 'Redesign');
      await taskLink(page, 'Main').click();
      const experiment = await newTask(page, 'Experiment');
      await writeHeading(page, experiment.folder, 'Experiment');
      await taskLink(page, 'Main').click();
      const third = await newTask(page, 'Third');
      await writeHeading(page, third.folder, 'Third');
      // Redesign merges cleanly: Main has not moved since it started.
      await taskLink(page, 'Redesign').click();
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review changes for Main' });
      await expect(review).toBeVisible();
      await expect(review.getByText('Both versions changed')).toHaveCount(0);
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled();
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
      await expect(review).toHaveCount(0);
      expect(readFileSync(join(mainFolder, 'index.html'), 'utf8')).toBe('<h1>Redesign</h1>');
      // Experiment overlaps: the review explains it; Use Main keeps what Main has.
      await taskLink(page, 'Experiment').click();
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      await expect(review).toBeVisible();
      await expect(review.getByText('Both versions changed')).toBeVisible();
      await expect(
        review.getByRole('button', { name: 'Merge into Main', exact: true }),
      ).toBeDisabled();
      await review.getByRole('button', { name: 'Use Main', exact: true }).click();
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled();
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
      await expect(review).toHaveCount(0);
      expect(readFileSync(join(mainFolder, 'index.html'), 'utf8')).toBe('<h1>Redesign</h1>');
      // Experiment's own version is still in its Working Copy.
      expect(readFileSync(join(experiment.folder, 'index.html'), 'utf8')).toBe(
        '<h1>Experiment</h1>',
      );
      // Third overlaps too: Use task makes Main the Task's version.
      await taskLink(page, 'Third').click();
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      await expect(review.getByText('Both versions changed')).toBeVisible();
      await review.getByRole('button', { name: 'Use task', exact: true }).click();
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled();
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
      await expect(review).toHaveCount(0);
      expect(readFileSync(join(mainFolder, 'index.html'), 'utf8')).toBe('<h1>Third</h1>');
      expect(readFileSync(join(redesign.folder, 'index.html'), 'utf8')).toBe('<h1>Redesign</h1>');
      await expect(taskLink(page, 'Experiment')).toContainText('merged');
      await expect(taskLink(page, 'Third')).toContainText('merged');
    } finally {
      await app.close();
    }
  });

  test('TASK-07 — review and archive are refused while a turn runs or a decision waits; the Task is intact afterwards', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Busy task');
      const side = await newTask(page, 'Side');
      const input = page.getByPlaceholder('Send a message...');
      const refusal = page.getByRole('alert').filter({ hasText: 'Wait for this workspace' });
      // A held turn: twelve seconds of work.
      await input.fill('[workspace:Side]');
      await input.press('Enter');
      await expect(page.getByTestId('turn-job')).toBeVisible();
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      await expect(refusal).toBeVisible();
      await expect(page.getByRole('dialog', { name: /^Review changes/ })).toHaveCount(0);
      await page.getByRole('button', { name: 'Archive task', exact: true }).click();
      await expect(refusal).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reopen task', exact: true })).toHaveCount(0);
      await expect(page.getByText('Completed workspace Side.', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      // A pending decision blocks the same way.
      await input.fill('[workspace:Side:delete]');
      await input.press('Enter');
      const request = page.locator('[data-tending-request]');
      await expect(request).toContainText('Delete shared.txt?', { timeout: 30_000 });
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      await expect(refusal).toBeVisible();
      await expect(page.getByRole('dialog', { name: /^Review changes/ })).toHaveCount(0);
      await request.getByRole('button', { name: 'Keep' }).click();
      await expect(page.getByText('Completed workspace Side.', { exact: true }).nth(1)).toBeVisible(
        {
          timeout: 60_000,
        },
      );
      // Settled: the review opens; cancelling leaves the Task as it was.
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review changes for Main' });
      await expect(review).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(review).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
      expect(readFileSync(join(side.folder, 'shared.txt'), 'utf8')).toBe('Owned by Side\n');
      await expect(taskLink(page, 'Side')).not.toContainText('merged');
    } finally {
      await app.close();
    }
  });

  test('TASK-08 — a Task cannot publish; the Share pane points back to Main', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Task work');
      await writeFirstFile(page, 'index.html', '<h1>Main</h1>');
      await (await newTaskButton(page)).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Side quest');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
      // In the Task: Share, Sync, Export and Metadata belong to Main.
      for (const [type, toggle] of [
        ['publish', 'Toggle share'],
        ['export', 'Toggle export'],
      ] as const) {
        await page.getByRole('button', { name: 'Add panel', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Add panel', exact: true })
          .getByRole('button', { name: toggle, exact: true })
          .click();
        const pane = page.getByTestId(`pane-body-${type}`);
        await expect(page.locator(`.mosaic-window.pane-${type}`)).toBeVisible({ timeout: 30_000 });
        await expect(pane.getByText('Available in Main')).toBeVisible({ timeout: 30_000 });
        await expect(pane.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
      }
      // Back in Main the Share pane is itself again.
      await page.getByRole('link', { name: 'Main', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Task work',
      );
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Add panel', exact: true })
        .getByRole('button', { name: 'Toggle share', exact: true })
        .click();
      const share = page.getByTestId('pane-body-publish');
      await expect(share.getByRole('button', { name: 'Share', exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  });
});
