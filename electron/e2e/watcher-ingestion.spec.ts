import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

test('an external edit immediately after an app write enters history instead of being suppressed as an echo', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Rapid edits');
    const { projectFolder: folder } = await storedCrux(page, id);
    // Both operations use the real Project Folder. The second is deliberately within
    // the former three-second self-write suppression window.
    await page.evaluate(async (folder) => {
      await window.electronAPI!.project.writeFile(
        folder,
        'note.txt',
        new TextEncoder().encode('App version'),
      );
    }, folder);
    writeFileSync(join(folder, 'note.txt'), 'External version');
    const fingerprint = createHash('sha256').update('External version').digest('hex');
    await expect
      .poll(async () => {
        const row = (await page.evaluate(
          async (id) =>
            window.electronAPI!.sqlite.get(
              "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = 'note.txt'",
              [id],
            ),
          id,
        )) as { fingerprint: string } | undefined;
        return row?.fingerprint;
      })
      .toBe(fingerprint);
    await page.getByRole('button', { name: 'Toggle history' }).click();
    const history = page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('External edit preserved');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('External edit preserved', { exact: true })).toBeVisible();
    const saved = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get(
          `SELECT a.fingerprint FROM dimensions d JOIN artifacts a ON a.resource_id = d.target_id
       WHERE d.source_id = ? AND d.type = 'growth' AND a.path = 'note.txt'
       ORDER BY d.weight DESC LIMIT 1`,
          [id],
        ),
      id,
    )) as { fingerprint: string };
    expect(saved.fingerprint).toBe(fingerprint);
  } finally {
    await app.close();
  }
});
