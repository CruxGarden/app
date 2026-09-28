import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

async function newTask(page: Page) {
  await (await newTaskButton(page)).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Parent task');
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}

for (const origin of ['Main', 'Task'] as const) {
  test(`unconflicted workers merge into their live ${origin} turn without interrupting it or marking Growth`, async () => {
    const launch = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(launch.page);
      const main = await createCrux(launch.page, 'Live delegation');
      const source = origin === 'Main' ? main : await newTask(launch.page);
      const input = launch.page.getByPlaceholder('Send a message...');
      await input.fill('Please caption these in parallel without overlap');
      await input.press('Enter');
      await expect(launch.page.getByTestId('merge')).toHaveAttribute('data-status', 'merged', {
        timeout: 30_000,
      });
      await expect(
        launch.page.getByText('Done — parallel workers finished.', { exact: true }),
      ).toBeVisible();
      await expect(launch.page.getByTestId('turn-job')).toHaveAttribute('data-status', 'done');
      const state = await launch.page.evaluate(
        async ({ main, source }) => {
          const db = window.electronAPI!.sqlite,
            content = db.fileContent!;
          const sourceRow = (await db.get(
            'SELECT meta FROM cruxes WHERE id = ? UNION ALL SELECT meta FROM working_copies WHERE id = ?',
            [source, source],
          )) as { meta: string };
          const head = await content.head(source);
          const mainHead = await content.head(main);
          return {
            meta: JSON.parse(sourceRow.meta),
            files: (await content.list({ cruxId: source, expected: head })).entries.map(
              (e) => e.path,
            ),
            mainFiles: mainHead
              ? (await content.list({ cruxId: main, expected: mainHead })).entries.map(
                  (e) => e.path,
                )
              : [],
            growth: await db.all(
              "SELECT id FROM dimensions WHERE type = 'growth' AND deleted IS NULL",
            ),
          };
        },
        { main, source },
      );
      expect(state.files).toEqual(expect.arrayContaining(['alpha.md', 'beta.md', 'gamma.md']));
      expect(state.meta.turnJob.status).toBe('done');
      expect(state.meta.messages.filter((m: any) => m.taskMergeId)).toHaveLength(1);
      expect(state.meta.messages.at(-1).content).toBe('Done — parallel workers finished.');
      expect(state.growth).toEqual([]);
      if (source !== main) expect(state.mainFiles).not.toContain('alpha.md');
    } finally {
      await launch.app.close();
    }
  });
}

test('Stop cancels all Task workers, retaining their independent work across restart', async () => {
  const env = { CRUX_AI_MOCK: '1' };
  let launch = await launchApp({ env });
  try {
    await enterGarden(launch.page);
    const main = await createCrux(launch.page, 'Stopped delegation');
    const source = await newTask(launch.page);
    const input = launch.page.getByPlaceholder('Send a message...');
    await input.fill('Please caption these in parallel, slowly');
    await input.press('Enter');
    const rows = launch.page.getByTestId('subagent');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-status', 'running');
    await launch.page
      .getByTestId('turn-job')
      .getByRole('button', { name: 'Stop', exact: true })
      .click();
    await expect(launch.page.getByTestId('turn-job')).toHaveAttribute('data-status', 'interrupted');
    for (let i = 0; i < 3; i++)
      await expect(rows.nth(i)).toHaveAttribute('data-status', 'interrupted');
    await expect(launch.page.getByTestId('merge')).toHaveCount(0);
    const dir = launch.dir;
    await launch.app.close();
    launch = await launchApp({ dir, env });
    await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(launch.page.getByRole('button', { name: 'Navigator', exact: true })).toBeVisible();
    await launch.page.goto(`crux-app://app/c/${main}?task=${source}`);
    await expect(launch.page.getByTestId('turn-job')).toHaveAttribute('data-status', 'interrupted');
    const state = await launch.page.evaluate(
      async ({ main, source }) => {
        const db = window.electronAPI!.sqlite,
          content = db.fileContent!;
        return {
          files: (
            await content.list({ cruxId: source, expected: await content.head(source) })
          ).entries.map((e) => e.path),
          copies: (await db.all(
            "SELECT title, meta FROM working_copies WHERE crux_id = ? AND role = 'task'",
            [main],
          )) as { title: string; meta: string }[],
          growth: await db.all(
            "SELECT id FROM dimensions WHERE type = 'growth' AND deleted IS NULL",
          ),
          merges: await db.all('SELECT id FROM task_merges'),
        };
      },
      { main, source },
    );
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      const worker = state.copies.find((copy) => copy.title === title)!;
      expect(worker).toBeDefined();
      expect(JSON.parse(worker.meta).messages[0].content).toContain(`[Subagent] ${title}`);
    }
    expect(state.files.filter((path) => /^(alpha|beta|gamma|notes)\.md$/.test(path))).toEqual([]);
    expect(state.growth).toEqual([]);
    expect(state.merges).toEqual([]);
  } finally {
    await launch.app.close();
  }
});

test('source edits during delegation stay untouched until the result Task is explicitly reviewed', async () => {
  const launch = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(launch.page);
    const main = await createCrux(launch.page, 'Concurrent source edit');
    const source = await newTask(launch.page);
    const input = launch.page.getByPlaceholder('Send a message...');
    await input.fill('Please caption these in parallel without overlap, slowly');
    await input.press('Enter');
    await expect(launch.page.getByTestId('subagent').first()).toHaveAttribute(
      'data-status',
      'running',
    );
    await launch.page.evaluate(async (source) => {
      const row = (await window.electronAPI!.sqlite.get(
        'SELECT project_folder FROM working_copies WHERE id = ?',
        [source],
      )) as { project_folder: string };
      await window.electronAPI!.project.writeFile(
        row.project_folder,
        'alpha.md',
        new TextEncoder().encode('My independent edit\n'),
      );
    }, source);
    await expect(launch.page.getByTestId('merge').getByRole('alert')).toContainText(
      'source has conflicting edits',
      { timeout: 30_000 },
    );
    await expect(
      launch.page.getByText('Done — parallel workers finished.', { exact: true }),
    ).toBeVisible();
    const before = await launch.page.evaluate(async (source) => {
      const content = window.electronAPI!.sqlite.fileContent!;
      return (
        await content.list({ cruxId: source, expected: await content.head(source) })
      ).entries.map((entry) => entry.path);
    }, source);
    expect(before).not.toContain('beta.md');
    expect(before).not.toContain('gamma.md');
    await launch.page.getByRole('link', { name: 'Open result Task', exact: true }).click();
    await launch.page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const dialog = launch.page.getByRole('dialog', {
      name: 'Review changes for Parent task',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Use Parent task', exact: true }).click();
    await dialog.getByRole('button', { name: 'Check combined result', exact: true }).click();
    await expect(dialog.getByRole('checkbox')).toBeEnabled();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Merge into Parent task', exact: true }).click();
    await expect(launch.page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      source,
    );
    await expect(launch.page.getByTestId('merge')).toHaveAttribute('data-status', 'merged');
    await expect(launch.page.getByTestId('merge')).toContainText('2 files');
    await launch.page.screenshot({ path: '/private/tmp/crux-delegated-result.png' });
    const result = await launch.page.evaluate(
      async ({ main, source }) => {
        const db = window.electronAPI!.sqlite,
          content = db.fileContent!;
        const file = await content.read({
          cruxId: source,
          expected: await content.head(source),
          path: 'alpha.md',
        });
        return {
          alpha: new TextDecoder().decode(file!.bytes),
          files: (
            await content.list({ cruxId: source, expected: await content.head(source) })
          ).entries.map((entry) => entry.path),
          journals: await db.all(
            "SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'merged'",
            [main],
          ),
          growth: await db.all(
            "SELECT id FROM dimensions WHERE type = 'growth' AND deleted IS NULL",
          ),
        };
      },
      { main, source },
    );
    expect(result.alpha).toBe('My independent edit\n');
    expect(result.files).toEqual(expect.arrayContaining(['beta.md', 'gamma.md']));
    expect(result.journals).toHaveLength(1);
    expect(result.growth).toEqual([]);
  } finally {
    await launch.app.close();
  }
});
