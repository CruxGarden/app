import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

test('retained Task base permits review after Main restores before its starting version', async () => {
  const launch = await launchApp();
  const page = launch.page;
  try {
    await enterGarden(page);
    const main = await createCrux(page, 'Main restore and Task review');
    const versions = await page.evaluate(async (main) => {
      const db = window.electronAPI!.sqlite;
      const files = db.fileContent!;
      const mark = async (text: string, parentId: string | null) => {
        const bytes = new TextEncoder().encode(text);
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const folder = JSON.parse(
          ((await db.get('SELECT meta FROM cruxes WHERE id=?', [main])) as { meta: string }).meta,
        ).projectFolder;
        await window.electronAPI!.project.writeFile(folder, 'main.txt', bytes);
        const head = await files.edit({
          cruxId: main,
          expected: await files.head(main),
          changes: [
            {
              put: {
                id: 'main-file',
                path: 'main.txt',
                fingerprint,
                size: bytes.length,
                encoding: 'utf-8',
                mimeType: 'text/plain',
                mode: 0o644,
                attributes: {},
              },
              bytes,
            },
          ],
        });
        await files.finishProjection(main);
        const saved = await files.snapshot({
          cruxId: main,
          expected: head,
          snapshotId: crypto.randomUUID(),
          parentId,
          meta: { label: text },
        });
        const meta = JSON.parse(
          ((await db.get('SELECT meta FROM cruxes WHERE id=?', [main])) as { meta: string }).meta,
        );
        await db.mergeCruxMeta!(main, {
          settings: { ...meta.settings, activeBranch: saved.snapshot.id },
        });
        return saved.snapshot.id;
      };
      const earlier = await mark('Earlier Main', null);
      const latest = await mark('Task starting Main', earlier);
      return { earlier, latest };
    }, main);
    await page.reload();
    await newTaskButton(page);
    await (await newTaskButton(page)).click();
    await page
      .getByRole('textbox', { name: 'Task name', exact: true })
      .fill('Independent addition');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const copy = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await page.evaluate(
      async ({ main, copy, earlier }) => {
        const db = window.electronAPI!.sqlite,
          files = db.fileContent!;
        const bytes = new TextEncoder().encode('Task addition');
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const folder = (
          (await db.get('SELECT project_folder FROM working_copies WHERE id=?', [copy])) as {
            project_folder: string;
          }
        ).project_folder;
        await window.electronAPI!.project.writeFile(folder, 'task.txt', bytes);
        await files.edit({
          cruxId: copy,
          expected: await files.head(copy),
          changes: [
            {
              put: {
                id: 'task-file',
                path: 'task.txt',
                fingerprint,
                size: bytes.length,
                encoding: 'utf-8',
                mimeType: 'text/plain',
                mode: 0o644,
                attributes: {},
              },
              bytes,
            },
          ],
        });
        await files.finishProjection(copy);
        const meta = JSON.parse(
          ((await db.get('SELECT meta FROM cruxes WHERE id=?', [main])) as { meta: string }).meta,
        );
        await files.restore({
          safety: { cruxId: main, expected: await files.head(main) },
          target: { cruxId: earlier, expected: await files.head(earlier) },
          workspace: { expectedMeta: meta, messages: [] },
        });
        await files.finishProjection(main);
      },
      { main, copy, earlier: versions.earlier },
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Check combined result' }).click();
    await expect(review.getByRole('checkbox')).toBeEnabled();
    await review.getByRole('checkbox').check();
    await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(review).toHaveCount(0);
    const result = await page.evaluate(
      async ({ main, copy }) => {
        const db = window.electronAPI!.sqlite,
          files = db.fileContent!;
        const head = await files.head(main);
        const read = async (path: string) =>
          new TextDecoder().decode(
            (await files.read({ cruxId: main, expected: head, path }))!.bytes,
          );
        return {
          main: await read('main.txt'),
          task: await read('task.txt'),
          base: await db.workingCopyBase!(copy),
          growth: await db.all("SELECT id FROM dimensions WHERE type='growth'"),
        };
      },
      { main, copy },
    );
    expect(result.main).toBe('Earlier Main');
    expect(result.task).toBe('Task addition');
    expect(result.base.workspace.parentId).toBe(versions.latest);
    expect(result.growth).toHaveLength(2);
  } finally {
    await launch.app.close();
  }
});
