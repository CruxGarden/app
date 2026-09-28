import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newTaskButton } from './panel-helpers';

test('refused admission preserves Main and refused finalization preserves recoverable state and resumes after restart without duplicate Growth', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const main = await createCrux(page, 'Recover merge');
    await addArtifact(page, 'index.html');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('<h1>Main version</h1>');
    await page.keyboard.press('ControlOrMeta+s');
    await (await newTaskButton(page)).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Merge task');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const copy = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = await page.evaluate(
      async (id) =>
        (
          (await window.electronAPI!.sqlite.get(
            'SELECT project_folder FROM working_copies WHERE id = ?',
            [id],
          )) as { project_folder: string }
        ).project_folder,
      copy,
    );
    writeFileSync(join(folder, 'index.html'), '<h1>Task result</h1>');
    await expect
      .poll(() =>
        page.evaluate(async (id) => {
          const content = window.electronAPI!.sqlite.fileContent!;
          const head = await content.head(id);
          if (!head) return null;
          const file = await content.read({ cruxId: id, expected: head, path: 'index.html' });
          return file ? new TextDecoder().decode(file.bytes) : null;
        }, copy),
      )
      .toBe('<h1>Task result</h1>');
    // Mark a deliberate version only to exercise damaged ancestry during recovery.
    // Task creation itself must have added no Growth at all.
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM dimensions WHERE type='growth'"),
      ),
    ).toEqual([]);
    await page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      const head = await db.fileContent!.head(id);
      const marked = await db.fileContent!.snapshot({
        cruxId: id,
        expected: head,
        snapshotId: crypto.randomUUID(),
        parentId: null,
        meta: { label: 'Ready for review' },
      });
      await db.updateWorkingCopyMeta!(id, { settings: { activeBranch: marked.snapshot.id } });
    }, copy);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const beforeReviewGrowth = await page.evaluate(() =>
      window.electronAPI!.sqlite.all("SELECT * FROM dimensions WHERE type = 'growth' ORDER BY id"),
    );
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await expect(review).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT * FROM dimensions WHERE type = 'growth' ORDER BY id",
        ),
      ),
    ).toEqual(beforeReviewGrowth);
    await review.getByRole('button', { name: 'Check combined result' }).click();
    await expect(review.getByRole('checkbox')).toBeEnabled();
    await review.getByRole('checkbox').check();
    // Admission failure must happen before Main's files or merge history change.
    const before = await page.evaluate(
      async ({ main, copy }) => {
        const db = window.electronAPI!.sqlite;
        const merge = await db.get('SELECT * FROM task_merges WHERE copy_id = ?', [copy]);
        const growth = await db.all(
          "SELECT * FROM dimensions WHERE source_id = ? AND type = 'growth'",
          [main],
        );
        const row = (await db.get('SELECT meta FROM cruxes WHERE id = ?', [main])) as {
          meta: string;
        };
        await db.run(
          "CREATE TRIGGER refuse_admission BEFORE UPDATE ON task_merges WHEN NEW.phase = 'applying' BEGIN SELECT RAISE(ABORT, 'Review admission refused'); END",
        );
        return { merge, growth, folder: JSON.parse(row.meta).projectFolder as string };
      },
      { main, copy },
    );
    await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(review.getByRole('alert')).toContainText('Review admission refused');
    expect(readFileSync(join(before.folder, 'index.html'), 'utf8')).toBe('<h1>Main version</h1>');
    expect(
      await page.evaluate(
        ({ main, copy }) =>
          Promise.all([
            window.electronAPI!.sqlite.get('SELECT * FROM task_merges WHERE copy_id = ?', [copy]),
            window.electronAPI!.sqlite.all(
              "SELECT * FROM dimensions WHERE source_id = ? AND type = 'growth'",
              [main],
            ),
          ]),
        { main, copy },
      ),
    ).toEqual([before.merge, before.growth]);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_admission'));
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_finish BEFORE UPDATE ON task_merges WHEN NEW.phase = 'merged' BEGIN SELECT RAISE(ABORT, 'Final journal refused'); END",
      ),
    );
    await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(review.getByRole('alert')).toContainText('Final journal refused');
    const journal = await page.evaluate(async (copy) => {
      const db = window.electronAPI!.sqlite;
      const merge = (await db.get(
        'SELECT id, candidate_id, phase FROM task_merges WHERE copy_id = ?',
        [copy],
      )) as { id: string; candidate_id: string; phase: string };
      return {
        ...merge,
        copies: await db.all('SELECT id, phase FROM working_copies WHERE id IN (?, ?)', [
          copy,
          merge.candidate_id,
        ]),
        results: await db.all("SELECT id FROM cruxes WHERE json_extract(meta, '$.merge.id') = ?", [
          merge.id,
        ]),
      };
    }, copy);
    expect(journal.phase).toBe('applying');
    expect(journal.copies).toEqual(
      expect.arrayContaining([
        { id: copy, phase: 'ready' },
        { id: journal.candidate_id, phase: 'ready' },
      ]),
    );
    expect(journal.results).toHaveLength(0);
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.goto(`crux-app://app/c/${main}?task=${copy}`);
    await expect(page.getByRole('button', { name: 'Resume merge', exact: true })).toBeVisible();
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_finish'));
    // A damaged transcript must not silently complete with a truncated Collaboration.
    const transcript = await page.evaluate(
      async ({ main, copy, mergeId }) => {
        const db = window.electronAPI!.sqlite;
        const journal = (await db.get('SELECT * FROM task_merges WHERE id = ?', [mergeId])) as {
          data: string;
        };
        const source = JSON.parse(journal.data).sourceState.workspace.parentId as string;
        const mainRow = await db.get('SELECT * FROM cruxes WHERE id = ?', [main]);
        await db.run(
          "UPDATE dimensions SET deleted = ? WHERE source_id = ? AND target_id = ? AND type = 'growth'",
          [new Date().toISOString(), copy, source],
        );
        return { source, journal, mainRow };
      },
      { main, copy, mergeId: journal.id },
    );
    await page.getByRole('button', { name: 'Resume merge', exact: true }).click();
    await expect(
      page
        .getByTestId('task-bar')
        .getByRole('alert')
        .filter({ hasText: 'Recovery context requires retained Growth' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async ({ main, mergeId }) => {
          const db = window.electronAPI!.sqlite;
          return {
            journal: await db.get('SELECT * FROM task_merges WHERE id = ?', [mergeId]),
            mainRow: await db.get('SELECT * FROM cruxes WHERE id = ?', [main]),
          };
        },
        { main, mergeId: journal.id },
      ),
    ).toEqual({ journal: transcript.journal, mainRow: transcript.mainRow });
    await page.evaluate(
      ({ copy, source }) =>
        window.electronAPI!.sqlite.run(
          'UPDATE dimensions SET deleted = NULL WHERE source_id = ? AND target_id = ?',
          [copy, source],
        ),
      { copy, source: transcript.source },
    );
    await page.getByRole('button', { name: 'Resume merge', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume merge', exact: true })).toHaveCount(0);
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /^Merge task/ }),
    ).toContainText('merged');
    const saved = await page.evaluate(
      async ({ main, copy, journal }) => {
        const db = window.electronAPI!.sqlite;
        return {
          merge: await db.get('SELECT phase, data FROM task_merges WHERE id = ?', [journal.id]),
          growth: await db.all("SELECT * FROM dimensions WHERE source_id = ? AND type = 'growth'", [
            main,
          ]),
          copies: await db.all('SELECT id, phase FROM working_copies WHERE id IN (?, ?)', [
            copy,
            journal.candidate_id,
          ]),
          results: await db.all(
            "SELECT id FROM cruxes WHERE json_extract(meta, '$.merge.id') = ?",
            [journal.id],
          ),
          main: (await db.get('SELECT meta FROM cruxes WHERE id = ?', [main])) as { meta: string },
        };
      },
      { main, copy, journal },
    );
    expect(saved.merge).toMatchObject({ phase: 'merged' });
    expect(saved.growth).toEqual(before.growth);
    const result = JSON.parse((saved.merge as { data: string }).data).resultState;
    expect(result.root).toMatch(/^[a-f0-9]{64}$/);
    expect(
      result.workspace.messages.filter(
        (message: { taskMergeId?: string }) => message.taskMergeId === journal.id,
      ),
    ).toHaveLength(1);
    expect(JSON.parse(saved.main.meta).messages).toEqual(result.workspace.messages);
    await page.evaluate((id) => window.electronAPI!.sqlite.completeTaskMerge!(id), journal.id);
    expect(
      await page.evaluate(
        (id) => window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [id]),
        main,
      ),
    ).toEqual(saved.main);
    expect(saved.copies).toEqual(
      expect.arrayContaining([
        { id: copy, phase: 'merged' },
        { id: journal.candidate_id, phase: 'archived' },
      ]),
    );
    expect(saved.results).toEqual(journal.results);
    expect(
      readFileSync(join(JSON.parse(saved.main.meta).projectFolder, 'index.html'), 'utf8'),
    ).toBe('<h1>Task result</h1>');
  } finally {
    await launch.app.close();
  }
});
