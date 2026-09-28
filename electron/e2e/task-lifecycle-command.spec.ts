import { togglePanel, newTaskButton } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

// Uses the actual API owner, protected edit recovery and persistent Task content.
test('Task archive/reopen reports refusal, preserves content, retries and survives restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    let page = launch.page;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const main = await createCrux(page, 'Task lifecycle');
    await addArtifact(page, 'kept.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Preserved through archive');
    await page.keyboard.press('ControlOrMeta+s');
    await (await newTaskButton(page)).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Archive me');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Archive task', exact: true })).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const read = () =>
      page.evaluate(async (id) => {
        const db = window.electronAPI!.sqlite;
        const copy = (await db.get(
          'SELECT phase, project_folder FROM working_copies WHERE id = ?',
          [id],
        )) as { phase: string; project_folder: string };
        const content = db.fileContent!;
        const head = await content.head(id);
        const file = await content.read({ cruxId: id, expected: head!, path: 'kept.txt' });
        return { ...copy, content: new TextDecoder().decode(file!.bytes) };
      }, id);
    const growth = () =>
      page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.all(
            "SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'",
            [id],
          ),
        id,
      );
    const before = await read();
    const beforeGrowth = await growth();
    // A recovery refusal must prevent archiving, not silently discard the safety copy.
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_safety BEFORE INSERT ON edit_history BEGIN SELECT RAISE(ABORT, 'Recovery refused'); END",
      ),
    );
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_safety_update BEFORE UPDATE ON edit_history BEGIN SELECT RAISE(ABORT, 'Recovery refused'); END",
      ),
    );
    await page.getByRole('button', { name: 'Archive task', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Recovery refused' })).toBeVisible();
    expect(await read()).toEqual(before);
    expect(await growth()).toEqual(beforeGrowth);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_safety'));
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_safety_update'));
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_archive BEFORE UPDATE ON working_copies WHEN NEW.phase = 'archived' BEGIN SELECT RAISE(ABORT, 'Archive refused'); END",
      ),
    );
    await page.getByRole('button', { name: 'Archive task', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Archive refused' })).toBeVisible();
    expect(await read()).toEqual(before);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_archive'));
    await page.getByRole('button', { name: 'Archive task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen task', exact: true })).toBeVisible();
    expect(await read()).toEqual({ ...before, phase: 'archived' });
    expect(await growth()).toEqual(beforeGrowth);
    const retained = await page.evaluate(
      (id) => window.electronAPI!.sqlite.fileContent!.history(id),
      id,
    );
    expect(retained.checkpoints.some((p) => p.reason === 'safety')).toBe(true);
    await launch.app.close();
    launch = await launchApp({ dir });
    page = launch.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.goto(`crux-app://app/c/${main}?task=${id}`);
    await expect(page.getByRole('button', { name: 'Reopen task', exact: true })).toBeVisible();
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_reopen BEFORE UPDATE ON working_copies WHEN NEW.phase = 'ready' BEGIN SELECT RAISE(ABORT, 'Reopen refused'); END",
      ),
    );
    await page.getByRole('button', { name: 'Reopen task', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Reopen refused' })).toBeVisible();
    expect(await read()).toEqual({ ...before, phase: 'archived' });
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_reopen'));
    await page.getByRole('button', { name: 'Reopen task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Archive task', exact: true })).toBeVisible();
    expect(await read()).toEqual(before);
    if (!(await page.getByTestId('pane-body-artifacts').isVisible()))
      await togglePanel(page, 'Toggle artifacts');
    await page.getByRole('tree').getByText('kept.txt', { exact: true }).click();
    await expect(page.locator('.monaco-editor')).toContainText('Preserved through archive');
    expect(await growth()).toEqual(beforeGrowth);
    const restarted = await page.evaluate(
      (id) => window.electronAPI!.sqlite.fileContent!.history(id),
      id,
    );
    expect(restarted.checkpoints.map((p) => p.id)).toEqual(retained.checkpoints.map((p) => p.id));
  } finally {
    await launch.app.close();
  }
});
