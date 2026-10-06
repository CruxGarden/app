import { test, expect, type ElectronApplication } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import {
  createCrux,
  enterGarden,
  reenterWorkspace,
  storedCrux,
  storedFingerprint,
} from './multi-crux-helpers';
import { writeFirstFile } from './journeys/journey-helpers';
import { newTaskButton } from './panel-helpers';

async function pauseTaskAdmission(app: ElectronApplication) {
  await app.evaluate(({ app }) => {
    const path = process.getBuiltinModule('path');
    const load = process
      .getBuiltinModule('module')
      .createRequire(path.join(app.getAppPath(), 'package.json'));
    const { LocalGraphRuntime } = load(
      '@cruxgarden/local-api',
    ) as typeof import('@cruxgarden/local-api');
    const state = globalThis as typeof globalThis & {
      taskAdmissionEntered?: boolean;
      resumeTaskAdmission?: () => void;
    };
    const gate = new Promise<void>((resolve) => {
      state.resumeTaskAdmission = resolve;
    });
    const original = LocalGraphRuntime.prototype.createWorkingCopy;
    LocalGraphRuntime.prototype.createWorkingCopy = async function (...args) {
      LocalGraphRuntime.prototype.createWorkingCopy = original;
      state.taskAdmissionEntered = true;
      await gate;
      return original.apply(this, args);
    };
  });
}

test('native Quit refuses active Task preparation; cancel, completion and fresh quit preserve both copies after restart', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp({ ai: false });
  const dir = instance.dir;
  let exited = false;
  try {
    let { page, app } = instance;
    await enterGarden(page);
    const main = await createCrux(page, 'Retained before quit');
    const text = 'Saved before Task preparation';
    await writeFirstFile(page, 'kept.txt', text);
    const fingerprint = createHash('sha256').update(text).digest('hex');
    await expect.poll(() => storedFingerprint(page, main, 'kept.txt')).toBe(fingerprint);
    const folder = (await storedCrux(page, main)).projectFolder as string;
    await pauseTaskAdmission(app);
    await (await newTaskButton(page)).click();
    const taskDialog = page.getByRole('dialog', { name: 'New task', exact: true });
    await taskDialog.getByRole('textbox', { name: 'Task name', exact: true }).fill('Delayed Task');
    await taskDialog.getByRole('button', { name: 'Save and start task', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            (globalThis as typeof globalThis & { taskAdmissionEntered?: boolean })
              .taskAdmissionEntered,
        ),
      )
      .toBe(true);

    // The OS Quit entry must use the same workspace ownership as Task setup;
    // no simulated renderer state or bypass of the native close guard.
    await app.evaluate(({ app }) => app.quit());
    const close = page.getByRole('dialog', { name: 'Close Crux Garden', exact: true });
    await expect(close).toBeVisible();
    await expect(close.getByRole('alert')).toContainText(
      'Wait for this workspace’s task operation to finish before closing.',
    );
    await close.getByRole('button', { name: 'Save and exit', exact: true }).click();
    await expect(close.getByRole('alert')).toContainText(
      'Wait for this workspace’s task operation to finish before closing.',
    );
    expect(await storedFingerprint(page, main, 'kept.txt')).toBe(fingerprint);
    expect(readFileSync(join(folder, 'kept.txt'), 'utf8')).toBe(text);
    await close.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(close).toHaveCount(0);
    await expect(taskDialog).toBeVisible();
    await app.evaluate(() => {
      const state = globalThis as typeof globalThis & { resumeTaskAdmission?: () => void };
      state.resumeTaskAdmission!();
      delete state.resumeTaskAdmission;
    });
    await expect(taskDialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const taskId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    expect(taskId).not.toBe(main);
    await expect.poll(() => storedFingerprint(page, taskId, 'kept.txt')).toBe(fingerprint);
    const copy = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get(
          'SELECT phase, project_folder FROM working_copies WHERE id = ?',
          [id],
        ),
      taskId,
    )) as { phase: string; project_folder: string };
    expect(copy.phase).toBe('ready');
    expect(readFileSync(join(copy.project_folder, 'kept.txt'), 'utf8')).toBe(text);
    const closed = app.waitForEvent('close');
    await app.evaluate(({ app }) => app.quit());
    await closed;
    exited = true;
    instance = await launchApp({ ai: false, dir });
    exited = false;
    ({ page, app } = instance);
    await reenterWorkspace(page, 'Retained before quit · Delayed Task');
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    expect(await storedFingerprint(page, main, 'kept.txt')).toBe(fingerprint);
    expect(await storedFingerprint(page, taskId, 'kept.txt')).toBe(fingerprint);
    expect(readFileSync(join(folder, 'kept.txt'), 'utf8')).toBe(text);
    expect(readFileSync(join(copy.project_folder, 'kept.txt'), 'utf8')).toBe(text);
  } finally {
    if (!exited) {
      await instance.app
        .evaluate(() =>
          (
            globalThis as typeof globalThis & { resumeTaskAdmission?: () => void }
          ).resumeTaskAdmission?.(),
        )
        .catch(() => {});
      await instance.app.close();
    }
  }
});
