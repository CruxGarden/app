import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

test('API edits refresh open details without losing drafts, files or Task context, including restart', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const main = await createCrux(page, 'Live details');
    await addArtifact(page, 'draft.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Unsaved editor content');
    const details = page.getByTestId('task-details');
    await details.getByRole('textbox', { name: 'Notes' }).fill('Unsaved notes');
    // Bypass renderer services/stores entirely: emulate another host caller.
    await page.evaluate(async (id) => {
      await window.electronAPI!.sqlite.updateCrux!(id, {
        title: 'Background rename',
        meta: { notes: 'Background notes' },
      });
    }, main);
    await expect(details.getByRole('textbox', { name: 'Crux name' })).toHaveValue(
      'Background rename',
    );
    await expect(details.getByRole('textbox', { name: 'Notes' })).toHaveValue('Unsaved notes');
    await expect(page.locator('.monaco-editor')).toContainText('Unsaved editor content');
    await details.getByRole('textbox', { name: 'Notes' }).blur();
    await expect(details.getByText('Notes saved')).toBeVisible();
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('ControlOrMeta+s');
    await (await newTaskButton(page)).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('First task');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
    await expect(details).toContainText('This task');
    const task = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await page.evaluate(async (id) => {
      await window.electronAPI!.sqlite.updateWorkingCopyMeta!(
        id,
        { notes: 'From another caller' },
        'Background task',
      );
    }, task);
    await expect(details.getByRole('textbox', { name: 'Task name' })).toHaveValue(
      'Background task',
    );
    await expect(details.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'From another caller',
    );
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /Background task/ }),
    ).toBeVisible();
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    await page.evaluate(async (id) => {
      await window.electronAPI!.sqlite.updateWorkingCopyMeta!(id, {}, 'Hidden task rename');
    }, task);
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /Hidden task rename/ }),
    ).toBeVisible();
    await expect(details.getByRole('textbox', { name: 'Notes' })).toHaveValue('Unsaved notes');
    // A rollback cannot refresh either the input or the Task bar.
    const failed = await page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      await db.run(
        "CREATE TRIGGER fail_notice BEFORE UPDATE ON working_copies BEGIN SELECT RAISE(ABORT, 'No commit'); END",
      );
      try {
        await db.updateWorkingCopyMeta!(id, {}, 'Never committed');
        return false;
      } catch {
        return true;
      } finally {
        await db.run('DROP TRIGGER fail_notice');
      }
    }, task);
    expect(failed).toBe(true);
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /Never committed/ }),
    ).toHaveCount(0);
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.goto(`crux-app://app/c/${main}?task=${task}`);
    await expect(
      page.getByTestId('task-details').getByRole('textbox', { name: 'Task name' }),
    ).toHaveValue('Hidden task rename');
    await page.evaluate(async (id) => {
      await window.electronAPI!.sqlite.updateWorkingCopyMeta!(id, { notes: 'After restart' });
    }, task);
    await expect(
      page.getByTestId('task-details').getByRole('textbox', { name: 'Notes' }),
    ).toHaveValue('After restart');
  } finally {
    await launch.app.close();
  }
});
