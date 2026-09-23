import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

test('owned lifecycle failure is atomic, retries after restart, and leaves Project Folder and blobs intact', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await enterGarden(page);
    const id = await createCrux(page, 'Atomic lifecycle');
    await addArtifact(page, 'kept.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Keep the Project Folder');
    await page.keyboard.press('ControlOrMeta+s');
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Atomic lifecycle workspace' }).click();
    const closing = page.getByRole('dialog', { name: 'Close workspace' });
    if (await closing.isVisible().catch(() => false))
      await closing.getByRole('button', { name: 'Save and close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Atomic lifecycle' })).toBeVisible();
    const saved = await page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      const row = (await db.get('SELECT meta FROM cruxes WHERE id = ?', [id])) as { meta: string };
      const file = (await db.get(
        'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
        [id, 'kept.txt'],
      )) as { fingerprint: string };
      await db.setCruxTrashed!(id, true);
      await db.run(
        "CREATE TRIGGER refuse_purge BEFORE DELETE ON cruxes BEGIN SELECT RAISE(ABORT, 'Cannot commit purge'); END",
      );
      return {
        folder: JSON.parse(row.meta).projectFolder as string,
        fingerprint: file.fingerprint,
      };
    }, id);
    const trashRow = () =>
      page.getByTestId('trash-section').locator('li').filter({ hasText: 'Atomic lifecycle' });
    await expect(trashRow()).toBeVisible(); // background notice, no page reload
    const purge = async () => {
      await trashRow().getByRole('button', { name: 'Delete forever' }).click();
      await page
        .getByRole('dialog')
        .filter({ hasText: 'for good' })
        .getByRole('button', { name: 'Delete forever' })
        .click();
    };
    await purge();
    await expect(page.getByTestId('trash-section').getByRole('alert')).toContainText(
      'Cannot commit purge',
    );
    await expect(trashRow()).toBeVisible();
    const retained = await page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      return {
        crux: await db.get('SELECT id FROM cruxes WHERE id = ?', [id]),
        files: await db.all('SELECT id FROM artifacts WHERE resource_id = ?', [id]),
      };
    }, id);
    expect(retained.crux).toEqual({ id });
    expect(retained.files.length).toBeGreaterThan(0);
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(trashRow()).toBeVisible();
    await trashRow().getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('button', { name: 'Open Atomic lifecycle' })).toBeVisible();
    await page.evaluate(async (id) => {
      await window.electronAPI!.sqlite.setCruxTrashed!(id, true);
      await window.electronAPI!.sqlite.run('DROP TRIGGER refuse_purge');
    }, id);
    await purge();
    await expect(trashRow()).toHaveCount(0);
    expect(
      await page.evaluate(
        (id) => window.electronAPI!.sqlite.get('SELECT id FROM cruxes WHERE id = ?', [id]),
        id,
      ),
    ).toBeUndefined();
    expect(
      await page.evaluate((fp) => window.electronAPI!.sqlite.blobExists(fp), saved.fingerprint),
    ).toBe(true);
    const bytes = await launch.app.evaluate((_electron, folder) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      return fs.readFileSync(path.join(folder, 'kept.txt'), 'utf8');
    }, saved.folder);
    expect(bytes).toBe('Keep the Project Folder');
  } finally {
    await launch.app.close();
  }
});
