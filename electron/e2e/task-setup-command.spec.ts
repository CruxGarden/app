import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

test('refused Task completion retains setup across restart and recovery protects unexpected files', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await enterGarden(page);
    const main = await createCrux(page, 'Recover setup');
    await addArtifact(page, 'kept.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Prepared content survives');
    await page.keyboard.press('ControlOrMeta+s');
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_ready BEFORE UPDATE ON working_copies WHEN NEW.phase = 'ready' BEGIN SELECT RAISE(ABORT, 'Ready state refused'); END",
      ),
    );
    await (await newTaskButton(page)).click();
    const dialog = page.getByRole('dialog', { name: 'New task', exact: true });
    await dialog.getByRole('textbox', { name: 'Task name', exact: true }).fill('Recoverable task');
    await dialog.getByRole('button', { name: 'Save and start task' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Ready state refused');
    const copy = await page.evaluate(
      async () =>
        (await window.electronAPI!.sqlite.get(
          "SELECT id, phase, project_folder FROM working_copies WHERE title = 'Recoverable task'",
        )) as { id: string; phase: string; project_folder: string },
    );
    expect(copy.phase).toBe('failed');
    expect(readFileSync(join(copy.project_folder, 'kept.txt'), 'utf8')).toBe(
      'Prepared content survives',
    );
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.goto(new URL(`/c/${main}?task=${copy.id}`, page.url()).href);
    const recover = page.getByRole('button', { name: 'Recover task setup', exact: true });
    await expect(recover).toBeVisible();
    // Recovery must inspect the committed folder after restart, before any allocation.
    expect(
      await page.evaluate(
        (folder) => window.electronAPI!.project.folderExists(folder),
        copy.project_folder,
      ),
    ).toBe(true);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_ready'));
    writeFileSync(join(copy.project_folder, 'external.txt'), 'External work must remain');
    await recover.click();
    await expect(page.getByRole('alert').filter({ hasText: 'external.txt' })).toBeVisible();
    expect(
      await page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get(
            'SELECT phase, project_folder FROM working_copies WHERE id = ?',
            [id],
          ),
        copy.id,
      ),
    ).toEqual({ phase: 'failed', project_folder: copy.project_folder });
    expect(readFileSync(join(copy.project_folder, 'external.txt'), 'utf8')).toBe(
      'External work must remain',
    );
    // Simulate the person's explicit preservation of unexpected work before retrying.
    renameSync(join(copy.project_folder, 'external.txt'), join(dir, 'preserved-external.txt'));
    await recover.click();
    await expect(recover).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get(
            'SELECT phase, project_folder FROM working_copies WHERE id = ?',
            [id],
          ),
        copy.id,
      ),
    ).toEqual({ phase: 'ready', project_folder: copy.project_folder });
    expect(readFileSync(join(copy.project_folder, 'kept.txt'), 'utf8')).toBe(
      'Prepared content survives',
    );
    expect(readFileSync(join(dir, 'preserved-external.txt'), 'utf8')).toBe(
      'External work must remain',
    );
    await launch.app.close();
    launch = await launchApp({ dir, env });
    expect(
      await launch.page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get('SELECT phase FROM working_copies WHERE id = ?', [id]),
        copy.id,
      ),
    ).toEqual({ phase: 'ready' });
  } finally {
    await launch.app.close();
  }
});
