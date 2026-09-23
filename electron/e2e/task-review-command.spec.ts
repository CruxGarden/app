import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

test('closing a review rolls back journal refusal, retries and preserves Task content after restart', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const main = await createCrux(page, 'Close review');
    await addArtifact(page, 'kept.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Keep both task and candidate content');
    await page.keyboard.press('ControlOrMeta+s');
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Retained task');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const copy = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await expect(review).toBeVisible();
    const saved = await page.evaluate(async (copy) => {
      const db = window.electronAPI!.sqlite;
      const journal = (await db.get('SELECT id, candidate_id FROM task_merges WHERE copy_id = ?', [
        copy,
      ])) as { id: string; candidate_id: string };
      const candidate = await db.get(
        'SELECT phase, revision, project_folder FROM working_copies WHERE id = ?',
        [journal.candidate_id],
      );
      await db.run(
        "CREATE TRIGGER refuse_cancel BEFORE UPDATE ON task_merges WHEN NEW.phase = 'cancelled' BEGIN SELECT RAISE(ABORT, 'Cancellation refused'); END",
      );
      return { ...journal, candidate };
    }, copy);
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(review.getByRole('alert')).toContainText('Cancellation refused');
    expect(
      await page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get(
            'SELECT phase, revision, project_folder FROM working_copies WHERE id = ?',
            [id],
          ),
        saved.candidate_id,
      ),
    ).toEqual(saved.candidate);
    expect(
      await page.evaluate(
        (id) => window.electronAPI!.sqlite.get('SELECT phase FROM task_merges WHERE id = ?', [id]),
        saved.id,
      ),
    ).toEqual({ phase: 'review' });
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_cancel'));
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    const restored = await page.evaluate(
      async ({ copy, saved, main }) => {
        const db = window.electronAPI!.sqlite;
        const content = async (id: string) => {
          const file = (await db.get(
            "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = 'kept.txt'",
            [id],
          )) as { fingerprint: string };
          return new TextDecoder().decode(await db.blobRead(file.fingerprint));
        };
        return {
          journal: await db.get('SELECT phase FROM task_merges WHERE id = ?', [saved.id]),
          copies: await db.all('SELECT id, phase FROM working_copies WHERE id IN (?, ?)', [
            copy,
            saved.candidate_id,
          ]),
          contents: await Promise.all([main, copy, saved.candidate_id].map(content)),
        };
      },
      { copy, saved, main },
    );
    expect(restored.journal).toEqual({ phase: 'cancelled' });
    expect(restored.copies).toEqual(
      expect.arrayContaining([
        { id: copy, phase: 'ready' },
        { id: saved.candidate_id, phase: 'archived' },
      ]),
    );
    expect(restored.contents).toEqual(Array(3).fill('Keep both task and candidate content'));
  } finally {
    await launch.app.close();
  }
});
