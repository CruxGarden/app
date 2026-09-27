import { togglePanel } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, storedFingerprint } from './multi-crux-helpers';

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
    // Files are a manifest projection: the store's content head names the fingerprint.
    await expect
      .poll(() => storedFingerprint(page, id, 'note.txt'), { timeout: 60_000 })
      .toBe(fingerprint);
    await togglePanel(page, 'Toggle history');
    const history = page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('External edit preserved');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('External edit preserved', { exact: true })).toBeVisible();
    // The marked version is a Growth snapshot with its own content head.
    const snapshot = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get(
          `SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth' AND deleted IS NULL
       ORDER BY weight DESC LIMIT 1`,
          [id],
        ),
      id,
    )) as { target_id: string };
    expect(await storedFingerprint(page, snapshot.target_id, 'note.txt')).toBe(fingerprint);
  } finally {
    await app.close();
  }
});
