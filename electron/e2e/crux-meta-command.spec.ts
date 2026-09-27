import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import {
  enterGarden,
  createCrux,
  addArtifact,
  storedCrux,
  reenterWorkspace,
} from './multi-crux-helpers';
import { fileText } from './content-helpers';
import { togglePanel } from './panel-helpers';

test('owned metadata commands preserve concurrent fields, serve normal Growth and rename UI updates, and survive restart', async () => {
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
    // A refused complete edit must leave both details and metadata untouched.
    const refused = await launch.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      if (!db.updateCrux) throw new Error('Missing owned Crux command');
      await db.run(
        "CREATE TRIGGER refuse_details BEFORE UPDATE ON cruxes BEGIN SELECT RAISE(ABORT, 'Injected detail failure'); END",
      );
      let message = '';
      try {
        await db.updateCrux(id, { title: 'Must not persist', meta: { failed: true } });
      } catch (error) {
        message = String(error);
      } finally {
        await db.run('DROP TRIGGER refuse_details');
      }
      const before = (await db.get('SELECT title, meta FROM cruxes WHERE id = ?', [id])) as {
        title: string;
        meta: string;
      };
      await Promise.all([
        db.updateCrux(id, {
          description: 'Updated by agent',
          remoteId: 'remote-reference',
          meta: { retried: true },
        }),
        db.updateCrux(id, { meta: { concurrent: true }, kind: null }),
      ]);
      return { message, title: before.title, meta: JSON.parse(before.meta) };
    }, id);
    expect(refused.message).toContain('Injected detail failure');
    expect(refused.title).toBe('Atomic metadata');
    expect(refused.meta).not.toHaveProperty('failed');
    const expected = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`parallel${i}`, i]));
    expect(await storedCrux(launch.page, id)).toMatchObject({ projectFolder: folder, ...expected });
    // Observe the actual host command while taking a snapshot through normal UI.
    await launch.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load('./dist/sqlite-api.js');
      const merge = SqliteApi.prototype.updateCrux;
      (globalThis as any).__metadataCommands = 0;
      SqliteApi.prototype.updateCrux = function (id: string, patch: Record<string, unknown>) {
        (globalThis as any).__metadataCommands++;
        return merge.call(this, id, patch);
      };
    });
    if (!(await launch.page.getByTestId('pane-body-history').isVisible()))
      await togglePanel(launch.page, 'Toggle history');
    const history = launch.page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Owned metadata checkpoint');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(history.getByText('Owned metadata checkpoint', { exact: true })).toBeVisible();
    await expect
      .poll(() => launch.app.evaluate(() => (globalThis as any).__metadataCommands))
      .toBeGreaterThan(0);
    expect(await storedCrux(launch.page, id)).toMatchObject({ projectFolder: folder, ...expected });
    const beforeRename = await launch.app.evaluate(() => (globalThis as any).__metadataCommands);
    await launch.page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await launch.page.getByRole('button', { name: 'Rename current Crux…' }).click();
    const rename = launch.page.getByRole('dialog', { name: 'Rename Crux' });
    await rename.getByRole('textbox', { name: 'Crux title' }).fill('Renamed through API');
    await rename.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(rename).toHaveCount(0);
    expect(await launch.app.evaluate(() => (globalThis as any).__metadataCommands)).toBeGreaterThan(
      beforeRename,
    );
    await launch.page.keyboard.press('Escape');
    await launch.app.close();
    launch = await launchApp({ dir, env });
    await reenterWorkspace(launch.page, 'Renamed through API');
    await expect(launch.page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Renamed through API',
    );
    expect(await storedCrux(launch.page, id)).toMatchObject({ projectFolder: folder, ...expected });
    expect(await storedCrux(launch.page, id)).toMatchObject({ retried: true, concurrent: true });
    expect(
      await launch.page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.get(
            'SELECT description, remote_id, kind FROM cruxes WHERE id = ?',
            [id],
          ),
        id,
      ),
    ).toEqual({ description: 'Updated by agent', remote_id: 'remote-reference', kind: null });
    expect(await fileText(launch.page, id, 'saved.txt')).toBe('Preserved file');
  } finally {
    await launch.app.close();
  }
});
