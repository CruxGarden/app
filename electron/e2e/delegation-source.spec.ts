import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

// This proves the shared native storage capability. The live delegate tool's
// fan-out/review integration is a separate consumer cutover.
test('Task-sourced work retains its actual starting files through refusal, private Copy and restart', async () => {
  let launch = await launchApp();
  try {
    await enterGarden(launch.page);
    const main = await createCrux(launch.page, 'Delegation starting state');
    await launch.page.getByRole('button', { name: 'New task', exact: true }).click();
    await launch.page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Parent task');
    await launch.page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(
      launch.page.getByRole('button', { name: 'Review changes', exact: true }),
    ).toBeVisible();
    const task = (await launch.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const result = await launch.page.evaluate(
      async ({ main, task }) => {
        const db = window.electronAPI!.sqlite;
        const files = db.fileContent!;
        const row = (id: string) =>
          db.get('SELECT * FROM working_copies WHERE id = ?', [id]) as Promise<Record<string, any>>;
        const write = async (id: string, text: string) => {
          const bytes = new TextEncoder().encode(text);
          const folder = (await row(id)).project_folder;
          await window.electronAPI!.project.writeFile(folder, 'worker.txt', bytes);
          const fingerprint = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          )
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('');
          await files.edit({
            cruxId: id,
            expected: await files.head(id),
            changes: [
              {
                put: {
                  id: 'worker-file',
                  path: 'worker.txt',
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
        await write(task, 'Only in the parent Task');
        const id = crypto.randomUUID();
        const input = {
          id,
          cruxId: main,
          taskId: crypto.randomUUID(),
          title: 'Worker',
          role: 'task' as const,
          base: {
            sourceId: task,
            expected: await files.head(task),
            expectedMeta: JSON.parse((await row(task)).meta),
          },
          meta: { messages: [{ role: 'user', content: 'Independent worker instruction' }] },
        };
        await db.run(
          'CREATE TRIGGER refuse_worker BEFORE INSERT ON working_copies BEGIN SELECT RAISE(IGNORE); END',
        );
        let refused = false;
        try {
          await db.createWorkingCopy!(input);
        } catch {
          refused = true;
        }
        const partial = await row(id);
        await db.run('DROP TRIGGER refuse_worker');
        await db.createWorkingCopy!(input);
        const retained = await db.workingCopyBase!(id);
        const folder = await db.prepareWorkingCopyFolder!(id, (await row(id)).revision);
        for (const entry of retained.entries) {
          const content = await files.read({
            cruxId: id,
            expected: await files.head(id),
            path: entry.path,
          });
          if (!content) throw new Error('Missing retained worker file');
          await window.electronAPI!.project.writeFile(folder, entry.path, content.bytes);
        }
        await db.finishWorkingCopySetup!(id, (await row(id)).revision, 'ready');
        await write(task, 'Parent changed after delegation');
        await write(id, 'Worker changed independently');
        await db.run('DELETE FROM edit_history');
        const archive = await db.privateArchive!.export({ roots: [main], includeMembers: false });
        const owner = (await db.get('SELECT author_id, home_id FROM cruxes WHERE id = ?', [
          main,
        ])) as Record<string, string>;
        const imported = await db.privateArchive!.import(archive, {
          requestId: crypto.randomUUID(),
          mode: 'copy',
          destination: { authorId: owner.author_id, homeId: owner.home_id },
        });
        const copied = await db.workingCopyBase!(imported.ids[id]);
        return {
          id,
          copiedId: imported.ids[id],
          copiedSource: imported.ids[task],
          retained,
          copied,
          refused,
          partial: partial ?? null,
        };
      },
      { main, task },
    );
    expect(result.refused).toBe(true);
    expect(result.partial).toBeNull();
    expect(result.retained.sourceId).toBe(task);
    expect(result.copied).toEqual({ ...result.retained, sourceId: result.copiedSource });
    expect(result.retained.entries.some((entry) => entry.path === 'worker.txt')).toBe(true);
    const dir = launch.dir;
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: 'Enter', exact: true }).click();
    const persisted = await launch.page.evaluate(async ({ id, copiedId }) => {
      const db = window.electronAPI!.sqlite;
      return {
        original: await db.workingCopyBase!(id),
        copied: await db.workingCopyBase!(copiedId),
        growth: await db.all("SELECT id FROM dimensions WHERE type = 'growth'"),
      };
    }, result);
    expect(persisted.original).toEqual(result.retained);
    expect(persisted.copied).toEqual(result.copied);
    expect(persisted.growth).toEqual([]);
  } finally {
    await launch.app.close();
  }
});
