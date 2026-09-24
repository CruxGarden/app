import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact, storedCrux } from './multi-crux-helpers';

test('owned Task edits preserve independent state through UI failure, retry and restart', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    await launch.page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(launch.page);
    const main = await createCrux(launch.page, 'Owned tasks');
    await addArtifact(launch.page, 'kept.txt');
    await launch.page.locator('.monaco-editor').click();
    await launch.page.keyboard.type('Preserved task content');
    await launch.page.keyboard.press('ControlOrMeta+s');
    await launch.page.getByRole('button', { name: 'New task', exact: true }).click();
    await launch.page.getByRole('textbox', { name: 'Task name', exact: true }).fill('First task');
    await launch.page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        'CREATE TRIGGER refuse_create BEFORE INSERT ON working_copies BEGIN SELECT RAISE(IGNORE); END',
      ),
    );
    await launch.page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(
      launch.page.getByRole('dialog', { name: 'New task', exact: true }).getByRole('alert'),
    ).toBeVisible();
    expect(
      await launch.page.evaluate(() =>
        window.electronAPI!.sqlite.all('SELECT id FROM working_copies'),
      ),
    ).toEqual([]);
    expect(
      await launch.page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM dimensions WHERE type='growth'"),
      ),
    ).toEqual([]);
    await launch.page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_create'));
    await launch.page.getByRole('button', { name: 'Save and start task' }).click();

    await expect(launch.page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
    await expect(
      launch.page.getByRole('button', { name: 'Review changes', exact: true }),
    ).toBeVisible();
    const id = (await launch.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    expect(id).not.toBe(main);
    const read = () =>
      launch.page.evaluate(async (id) => {
        const row = (await window.electronAPI!.sqlite.get(
          'SELECT * FROM working_copies WHERE id = ?',
          [id],
        )) as Record<string, any>;
        return { ...row, meta: JSON.parse(row.meta) };
      }, id);
    const original = await read();
    await launch.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      if (!db.updateWorkingCopyMeta) throw new Error('Missing owned Task command');
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          db.updateWorkingCopyMeta!(id, {
            [`parallel${i}`]: i,
            projectFolder: '/wrong-folder',
            workingCopy: { cruxId: 'wrong' },
          }),
        ),
      );
    }, id);
    const parallel = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`parallel${i}`, i]));
    expect((await read()).meta).toMatchObject(parallel);
    expect((await read()).meta).not.toHaveProperty('projectFolder');
    expect((await read()).meta).not.toHaveProperty('workingCopy');
    await launch.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load('./dist/sqlite-api.js');
      const command = SqliteApi.prototype.updateWorkingCopyMeta;
      (globalThis as any).__taskCommands = 0;
      SqliteApi.prototype.updateWorkingCopyMeta = function (...args: unknown[]) {
        (globalThis as any).__taskCommands++;
        return command.apply(this, args);
      };
    });
    const details = launch.page.getByTestId('task-details');
    await expect(details).toContainText('This task');
    const beforeFailure = await read();
    await launch.page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_task BEFORE UPDATE ON working_copies BEGIN SELECT RAISE(ABORT, 'Injected Task failure'); END",
      ),
    );
    const notes = details.getByRole('textbox', { name: 'Notes' });
    await notes.fill('Should fail');
    await notes.blur();
    await expect(details.getByText(/Injected Task failure/)).toBeVisible();
    expect(await read()).toEqual(beforeFailure);
    await launch.page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_task'));
    await notes.fill('Saved after retry');
    await notes.blur();
    await expect(details.getByText('Notes saved')).toBeVisible();
    const name = details.getByRole('textbox', { name: 'Task name' });
    await name.fill('Renamed task');
    await name.press('Enter');
    await expect(details.getByText('Name saved')).toBeVisible();
    await expect(
      launch.page.getByTestId('task-bar').getByRole('link', { name: /Renamed task/ }),
    ).toBeVisible();
    expect(
      await launch.app.evaluate(() => (globalThis as any).__taskCommands),
    ).toBeGreaterThanOrEqual(3);
    expect(await storedCrux(launch.page, main)).not.toHaveProperty('notes');
    await launch.app.close();
    launch = await launchApp({ dir, env });
    await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await launch.page.goto(`crux-app://app/c/${main}?task=${id}`);
    await expect(
      launch.page.getByTestId('task-details').getByRole('textbox', { name: 'Task name' }),
    ).toHaveValue('Renamed task');
    await expect(
      launch.page.getByTestId('task-details').getByRole('textbox', { name: 'Notes' }),
    ).toHaveValue('Saved after retry');
    expect(await read()).toMatchObject({
      crux_id: main,
      task_id: original.task_id,
      base_state: original.base_state,
      project_folder: original.project_folder,
      phase: 'ready',
      meta: { ...parallel, notes: 'Saved after retry' },
    });
    const saved = await launch.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      const head = await db.fileContent!.head(id);
      const file = await db.fileContent!.read({ cruxId: id, expected: head, path: 'kept.txt' });
      return file ? new TextDecoder().decode(file.bytes) : null;
    }, id);
    expect(saved).toBe('Preserved task content');
  } finally {
    await launch.app.close();
  }
});
