import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

async function task(page: Page) {
  await (await newTaskButton(page)).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Parent task');
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}
async function files(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const content = window.electronAPI!.sqlite.fileContent!;
    const head = await content.head(id);
    return head ? (await content.list({ cruxId: id, expected: head })).entries : [];
  }, id);
}

for (const origin of ['Main', 'Task'] as const) {
  test(`delegated workers return checked results to ${origin} after a conflict and restart without Growth`, async () => {
    test.setTimeout(180_000);
    const env = { CRUX_AI_MOCK: '1' };
    let launch = await launchApp({ env });
    try {
      await enterGarden(launch.page);
      const main = await createCrux(launch.page, 'Delegation');
      const source = origin === 'Task' ? await task(launch.page) : main;
      const beforeMain = await files(launch.page, main);
      const input = launch.page.getByPlaceholder('Send a message...');
      await input.fill('Please caption these in parallel');
      await input.press('Enter');
      const workers = launch.page.getByTestId('subagent');
      await expect(workers).toHaveCount(3);
      for (let i = 0; i < 3; i++)
        await expect(workers.nth(i)).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
      await expect(launch.page.getByTestId('merge')).toHaveAttribute('data-status', 'pending');
      const copies = await launch.page.evaluate(
        async (main) =>
          window.electronAPI!.sqlite.all(
            "SELECT id, title, base_state FROM working_copies WHERE crux_id = ? AND role = 'task'",
            [main],
          ) as Promise<Array<{ id: string; title: string; base_state: string }>>,
        main,
      );
      for (const title of ['Alpha', 'Beta', 'Gamma']) {
        const worker = copies.find((copy) => copy.title === title);
        expect(worker, `${title} must be a retained Working Copy`).toBeDefined();
        expect(JSON.parse(worker!.base_state).sourceId ?? main).toBe(source);
        expect(
          (await files(launch.page, worker!.id)).some(
            (entry) => entry.path === `${title.toLowerCase()}.md`,
          ),
        ).toBe(true);
      }
      expect(
        (await files(launch.page, source)).some((entry) =>
          /^(alpha|beta|gamma|notes)\.md$/.test(entry.path),
        ),
      ).toBe(false);
      const dir = launch.dir;
      await launch.app.close();
      launch = await launchApp({ dir, env });
      await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect(
        launch.page.getByRole('button', { name: 'Navigator', exact: true }),
      ).toBeVisible();
      await launch.page.goto(`crux-app://app/c/${main}${source === main ? '' : `?task=${source}`}`);
      let merge = launch.page.getByTestId('merge');
      await expect(merge).toHaveAttribute('data-status', 'pending');
      await merge
        .getByRole('combobox', { name: 'Version of notes.md' })
        .selectOption({ label: 'Beta' });
      if (origin === 'Task')
        await launch.page.evaluate(() =>
          window.electronAPI!.sqlite.run(
            "CREATE TRIGGER refuse_delegation_finish BEFORE UPDATE ON task_merges WHEN NEW.phase = 'merged' BEGIN SELECT RAISE(ABORT, 'Delegated result refused'); END",
          ),
        );
      await merge.getByRole('button', { name: 'Merge', exact: true }).click();
      if (origin === 'Task') {
        await expect(merge.getByRole('alert')).toContainText('Delegated result refused');
        const recoveryDir = launch.dir;
        await launch.app.close();
        launch = await launchApp({ dir: recoveryDir, env });
        await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
        await expect(
          launch.page.getByRole('button', { name: 'Navigator', exact: true }),
        ).toBeVisible();
        await launch.page.goto(`crux-app://app/c/${main}?task=${source}`);
        await expect(
          launch.page.getByText('Parent task is protected', { exact: false }),
        ).toBeVisible();
        await launch.page.evaluate(() =>
          window.electronAPI!.sqlite.run('DROP TRIGGER refuse_delegation_finish'),
        );
        merge = launch.page.getByTestId('merge');
        await merge.getByRole('button', { name: 'Merge', exact: true }).click();
      }
      await expect(merge).toHaveAttribute('data-status', 'merged', { timeout: 30_000 });
      await expect(merge).toContainText('4 files');
      const result = await launch.page.evaluate(
        async ({ main, source }) => {
          const db = window.electronAPI!.sqlite,
            content = db.fileContent!;
          const file = await content.read({
            cruxId: source,
            expected: await content.head(source),
            path: 'notes.md',
          });
          return {
            text: new TextDecoder().decode(file!.bytes),
            growth: await db.all(
              "SELECT id FROM dimensions WHERE type = 'growth' AND deleted IS NULL",
            ),
            journals: (await db.all(
              "SELECT data FROM task_merges WHERE crux_id = ? AND phase = 'merged'",
              [main],
            )) as Array<{ data: string }>,
          };
        },
        { main, source },
      );
      expect(result.text).toBe('notes from Beta\n');
      expect(result.growth).toEqual([]);
      expect(result.journals).toHaveLength(1);
      expect(JSON.parse(result.journals[0]!.data).targetId).toBe(source);
      if (source !== main) expect(await files(launch.page, main)).toEqual(beforeMain);
    } finally {
      await launch.app.close();
    }
  });
}
