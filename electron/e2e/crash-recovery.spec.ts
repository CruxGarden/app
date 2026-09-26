import { togglePanel } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';
import { indexedFiles } from './content-helpers';

const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex');

test('after a process crash, offline file changes enter the index and the next Growth snapshot', async () => {
  const first = await launchApp();
  let crashed = false;
  let id = '';
  let folder = '';
  try {
    await enterGarden(first.page);
    id = await createCrux(first.page, 'Crash recovery');
    folder = (await storedCrux(first.page, id)).projectFolder;
    writeFileSync(join(folder, 'note.txt'), 'Before crash');
    writeFileSync(join(folder, 'removed.txt'), 'Remove while closed');
    await expect
      .poll(() => indexedFiles(first.page, id))
      .toMatchObject({
        'note.txt': fingerprint('Before crash'),
        'removed.txt': fingerprint('Remove while closed'),
      });
    // Kill only the isolated main process. Bypass the graceful quit/flush path.
    const exited = new Promise<void>((resolve) =>
      first.app.process().once('exit', () => resolve()),
    );
    first.app.process().kill('SIGKILL');
    await exited;
    crashed = true;
  } finally {
    if (!crashed) await first.app.close();
  }
  writeFileSync(join(folder, 'note.txt'), 'Edited while closed');
  unlinkSync(join(folder, 'removed.txt'));
  writeFileSync(join(folder, 'new.txt'), 'Created while closed');
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    // Entering lands on Garden Home; the Crux opens from its card.
    await second.page.getByRole('button', { name: 'Open Crash recovery', exact: true }).click();
    await expect(second.page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Crash recovery',
    );
    const expected = {
      'note.txt': fingerprint('Edited while closed'),
      'new.txt': fingerprint('Created while closed'),
    };
    await expect
      .poll(async () => {
        const files = await indexedFiles(second.page, id);
        return {
          note: files['note.txt'],
          added: files['new.txt'],
          removed: files['removed.txt'] ?? null,
        };
      })
      .toEqual({ note: expected['note.txt'], added: expected['new.txt'], removed: null });
    expect(readFileSync(join(folder, 'note.txt'), 'utf8')).toBe('Edited while closed');
    await togglePanel(second.page, 'Toggle history');
    const history = second.page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Recovered disk state');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('Recovered disk state', { exact: true })).toBeVisible();
    const snapshotId = (
      (await second.page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get(
            "SELECT target_id AS id FROM dimensions WHERE source_id = ? AND type = 'growth' ORDER BY weight DESC LIMIT 1",
            [id],
          ),
        id,
      )) as { id: string }
    ).id;
    const snapshot = await indexedFiles(second.page, snapshotId);
    expect(snapshot).toMatchObject(expected);
    expect(snapshot['removed.txt']).toBeUndefined();
    await second.page.screenshot({ path: 'e2e/.results/crash-recovery.png' });
  } finally {
    await second.app.close();
  }
});
