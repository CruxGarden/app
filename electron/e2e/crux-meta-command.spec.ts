import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('owned metadata commands preserve concurrent fields, serve normal Growth UI updates, and survive restart', async () => {
  const env = { CRUX_API_OWNER: '1' };
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    await enterGarden(launch.page);
    const id = await createCrux(launch.page, 'Atomic metadata');
    await addArtifact(launch.page, 'saved.txt');
    await launch.page.locator('.monaco-editor').click();
    await launch.page.keyboard.type('Preserved file');
    await launch.page.keyboard.press('ControlOrMeta+s');
    const folder = (await storedCrux(launch.page, id)).projectFolder;
    await launch.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      if (!db.mergeCruxMeta) throw new Error('Missing owned metadata capability');
      await Promise.all(
        Array.from({ length: 12 }, (_, i) => db.mergeCruxMeta!(id, { [`parallel${i}`]: i })),
      );
    }, id);
    const expected = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`parallel${i}`, i]));
    expect(await storedCrux(launch.page, id)).toMatchObject({ projectFolder: folder, ...expected });
    // Observe the actual host command while taking a snapshot through normal UI.
    await launch.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load('./dist/sqlite-api.js');
      const merge = SqliteApi.prototype.mergeCruxMeta;
      (globalThis as any).__metadataCommands = 0;
      SqliteApi.prototype.mergeCruxMeta = function (id: string, patch: Record<string, unknown>) {
        (globalThis as any).__metadataCommands++;
        return merge.call(this, id, patch);
      };
    });
    if (!(await launch.page.getByTestId('pane-body-history').isVisible()))
      await togglePanel(launch.page, 'Toggle history');
    const history = launch.page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Owned metadata checkpoint');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('Owned metadata checkpoint', { exact: true })).toBeVisible();
    await expect
      .poll(() => launch.app.evaluate(() => (globalThis as any).__metadataCommands))
      .toBeGreaterThan(0);
    expect(await storedCrux(launch.page, id)).toMatchObject({ projectFolder: folder, ...expected });
    await launch.app.close();
    launch = await launchApp({ dir, env });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    await expect(launch.page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Atomic metadata',
    );
    expect(await storedCrux(launch.page, id)).toMatchObject({ projectFolder: folder, ...expected });
    const saved = await launch.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      const row = (await db.get(
        'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
        [id, 'saved.txt'],
      )) as { fingerprint: string };
      return new TextDecoder().decode(await db.blobRead(row.fingerprint));
    }, id);
    expect(saved).toBe('Preserved file');
  } finally {
    await launch.app.close();
  }
});
