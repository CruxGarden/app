import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('a worker review resolves conflicts into its named source Task and recovers there after restart', async () => {
  let launch = await launchApp();
  try {
    await enterGarden(launch.page);
    const main = await createCrux(launch.page, 'Source review');
    await launch.page.getByRole('button', { name: 'New task', exact: true }).click();
    await launch.page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Parent task');
    await launch.page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(
      launch.page.getByRole('button', { name: 'Review changes', exact: true }),
    ).toBeVisible();
    const target = (await launch.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const prepared = await launch.page.evaluate(
      async ({ main, target }) => {
        const db = window.electronAPI!.sqlite,
          files = db.fileContent!;
        const row = (id: string) =>
          db.get('SELECT * FROM working_copies WHERE id = ?', [id]) as Promise<Record<string, any>>;
        const write = async (id: string, text: string) => {
          const bytes = new TextEncoder().encode(text);
          const folder = (await row(id)).project_folder;
          await window.electronAPI!.project.writeFile(folder, 'work.txt', bytes);
          const fingerprint = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          )
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          await files.edit({
            cruxId: id,
            expected: await files.head(id),
            changes: [
              {
                put: {
                  id: 'work',
                  path: 'work.txt',
                  fingerprint,
                  size: bytes.length,
                  mode: 0o644,
                  mimeType: 'text/plain',
                  encoding: 'utf-8',
                  attributes: {},
                },
                bytes,
              },
            ],
          });
          await files.finishProjection(id);
        };
        await write(target, 'Starting point\n');
        const worker = crypto.randomUUID();
        await db.createWorkingCopy!({
          id: worker,
          cruxId: main,
          taskId: crypto.randomUUID(),
          title: 'Worker',
          role: 'task',
          base: {
            sourceId: target,
            expected: await files.head(target),
            expectedMeta: JSON.parse((await row(target)).meta),
          },
          meta: { messages: [{ role: 'user', content: 'Worker instruction' }] },
        });
        const folder = await db.prepareWorkingCopyFolder!(worker, (await row(worker)).revision);
        for (const entry of (await db.workingCopyBase!(worker)).entries) {
          const content = await files.read({
            cruxId: worker,
            expected: await files.head(worker),
            path: entry.path,
          });
          await window.electronAPI!.project.writeFile(folder, entry.path, content!.bytes);
        }
        await db.finishWorkingCopySetup!(worker, (await row(worker)).revision, 'ready');
        await write(worker, 'Worker change\n');
        await write(target, 'Parent change\n');
        return {
          worker,
          mainHead: await files.head(main),
          mainMeta: JSON.parse(
            ((await db.get('SELECT meta FROM cruxes WHERE id = ?', [main])) as { meta: string })
              .meta,
          ),
        };
      },
      { main, target },
    );
    await launch.page.goto(`crux-app://app/c/${main}?task=${prepared.worker}`);
    await launch.page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const dialog = launch.page.getByRole('dialog', {
      name: 'Review changes for Parent task',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Both versions changed', { exact: false })).toBeVisible();
    await dialog.getByRole('button', { name: 'Use task', exact: true }).click();
    await dialog.getByRole('button', { name: 'Check combined result', exact: true }).click();
    await expect(dialog.getByRole('checkbox')).toBeEnabled();
    await dialog.getByRole('checkbox').check();
    await launch.page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_finish BEFORE UPDATE ON task_merges WHEN NEW.phase = 'merged' BEGIN SELECT RAISE(ABORT, 'Destination journal refused'); END",
      ),
    );
    await dialog.getByRole('button', { name: 'Merge into Parent task', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Destination journal refused');
    const admission = await launch.page.evaluate(async (target) => {
      const row = (await window.electronAPI!.sqlite.get(
        'SELECT project_folder FROM working_copies WHERE id = ?',
        [target],
      )) as { project_folder: string };
      try {
        await window.electronAPI!.agent.start({
          runId: crypto.randomUUID(),
          cruxId: target,
          cwd: row.project_folder,
          prompt: 'This must be refused before a provider starts.',
        });
        return 'Unexpectedly started';
      } catch (error) {
        return String(error);
      }
    }, target);
    expect(admission).toContain('Recover the pending merge');
    const setTargetFile = async (text: string) =>
      launch.page.evaluate(
        async ({ target, text }) => {
          const row = (await window.electronAPI!.sqlite.get(
            'SELECT project_folder FROM working_copies WHERE id = ?',
            [target],
          )) as { project_folder: string };
          await window.electronAPI!.project.writeFile(
            row.project_folder,
            'work.txt',
            new TextEncoder().encode(text),
          );
        },
        { target, text },
      );
    await setTargetFile('An external edit during recovery\n');
    const dir = launch.dir;
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(launch.page.getByRole('button', { name: 'Navigator', exact: true })).toBeVisible();
    await launch.page.goto(`crux-app://app/c/${main}?task=${prepared.worker}`);
    await expect(launch.page.getByText('Parent task is protected', { exact: false })).toBeVisible();
    await launch.page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_finish'));
    await launch.page.getByRole('button', { name: 'Resume merge', exact: true }).click();
    await expect(
      launch.page.getByRole('alert').filter({ hasText: 'External changes found at work.txt' }),
    ).toBeVisible();
    await setTargetFile('Worker change\n');
    await launch.page.getByRole('button', { name: 'Resume merge', exact: true }).click();
    await expect(launch.page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      target,
    );
    const result = await launch.page.evaluate(
      async ({ main, target, worker }) => {
        const db = window.electronAPI!.sqlite,
          files = db.fileContent!;
        const row = (await db.get('SELECT meta FROM working_copies WHERE id = ?', [target])) as {
          meta: string;
        };
        const journal = JSON.parse(
          (
            (await db.get('SELECT data FROM task_merges WHERE copy_id = ?', [worker])) as {
              data: string;
            }
          ).data,
        );
        const file = await files.read({
          cruxId: target,
          expected: await files.head(target),
          path: 'work.txt',
        });
        return {
          text: new TextDecoder().decode(file!.bytes),
          journal,
          messages: JSON.parse(row.meta).messages,
          mainHead: await files.head(main),
          mainMeta: JSON.parse(
            ((await db.get('SELECT meta FROM cruxes WHERE id = ?', [main])) as { meta: string })
              .meta,
          ),
          growth: await db.all("SELECT id FROM dimensions WHERE type = 'growth'"),
        };
      },
      { main, target, worker: prepared.worker },
    );
    expect(result.text).toBe('Worker change\n');
    expect(result.journal).toMatchObject({ phase: 'merged', cruxId: main, targetId: target });
    expect(
      result.messages.filter((message: any) => message.taskMergeId === result.journal.id),
    ).toHaveLength(1);
    expect(result.mainHead).toEqual(prepared.mainHead);
    expect(result.mainMeta.messages).toEqual(prepared.mainMeta.messages);
    expect(result.growth).toEqual([]);
  } finally {
    await launch.app.close();
  }
});
