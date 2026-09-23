import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Task preparation rolls back partial preview data, retries and preserves separate copies after restart', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await enterGarden(page);
    const main = await createCrux(page, 'Atomic Task setup');
    await addArtifact(page, 'kept.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Retained setup content');
    await page.keyboard.press('ControlOrMeta+s');
    const original = await page.evaluate(async (main) => {
      const db = window.electronAPI!.sqlite;
      for (const [index, visitor] of [null, crypto.randomUUID(), crypto.randomUUID()].entries()) {
        await db.run(
          'INSERT INTO store (id, crux_id, visitor_id, key, value, mode, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            crypto.randomUUID(),
            main,
            visitor,
            'preview',
            JSON.stringify({ slot: index }),
            visitor ? 'protected' : 'public',
            '2026-01-01T00:00:00.000Z',
            '2026-01-02T00:00:00.000Z',
          ],
        );
      }
      await db.run(
        `CREATE TRIGGER refuse_preview BEFORE INSERT ON store WHEN NEW.crux_id != '${main}' AND json_extract(NEW.value, '$.slot') = 2 BEGIN SELECT RAISE(ABORT, 'Preview preparation refused'); END`,
      );
      return db.all('SELECT * FROM store ORDER BY id');
    }, main);
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New task', exact: true });
    await dialog.getByRole('textbox', { name: 'Task name', exact: true }).fill('Complete preview');
    await dialog.getByRole('button', { name: 'Save and start task' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Preview preparation refused');
    expect(
      await page.evaluate(() => window.electronAPI!.sqlite.all('SELECT * FROM working_copies')),
    ).toEqual([]);
    expect(
      await page.evaluate(() => window.electronAPI!.sqlite.all('SELECT * FROM store ORDER BY id')),
    ).toEqual(original);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_preview'));
    await dialog.getByRole('button', { name: 'Save and start task' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    const saved = await page.evaluate(
      async ({ id, main }) => {
        const db = window.electronAPI!.sqlite;
        return {
          copy: (await db.get('SELECT phase, project_folder FROM working_copies WHERE id = ?', [
            id,
          ])) as { phase: string; project_folder: string },
          slots: await db.all<Record<string, unknown>>(
            'SELECT * FROM store WHERE crux_id = ? ORDER BY id',
            [id],
          ),
          source: await db.all('SELECT * FROM store WHERE crux_id = ? ORDER BY id', [main]),
        };
      },
      { id, main },
    );
    expect(saved.copy.phase).toBe('ready');
    expect(readFileSync(join(saved.copy.project_folder, 'kept.txt'), 'utf8')).toBe(
      'Retained setup content',
    );
    expect(saved.source).toEqual(original);
    expect(saved.slots).toHaveLength(original.length);
    for (const row of original as Record<string, unknown>[]) {
      const slot = saved.slots.find((value) => value.visitor_id === row.visitor_id)!;
      expect(slot.id).not.toBe(row.id);
      expect(slot).toEqual({ ...row, id: slot.id, crux_id: id });
    }
  } finally {
    await launch.app.close();
  }
});
