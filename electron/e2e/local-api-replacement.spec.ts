import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('the packaged API rolls back failed startup, replaces a graph, and restores its prior image across restarts', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const ids = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const { randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, CruxKind } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const Database = load('better-sqlite3');
      const folder = fs.realpathSync(app.getPath('userData'));
      const filename = path.join(folder, 'api-replacement.db');
      const owner = await LocalGraphRuntime.create(filename);
      const candidate = await LocalGraphRuntime.create(path.join(folder, 'api-incoming.db'));
      const authorId = randomUUID();
      const homeId = randomUUID();
      const input = () => ({ slug: randomUUID(), authorId, homeId, kind: CruxKind.GARDEN });
      try {
        const oldRoot = await owner.execute(({ crux }) => crux.create(input()));
        await owner.run("INSERT INTO settings VALUES ('checkpoint', 'original')");
        const root = await candidate.execute(({ crux }) => crux.create(input()));
        const child = await candidate.execute(({ crux }) => crux.create(input()));
        await candidate.addGardenMember({
          gardenId: root.id,
          memberId: child.id,
          authorId,
          homeId,
        });
        await candidate.run("INSERT INTO settings VALUES ('checkpoint', 'incoming')");
        // Replacement must preserve content outside the API's known table list.
        await candidate.run('CREATE TABLE extension_payload (bytes BLOB NOT NULL)');
        await candidate.run('INSERT INTO extension_payload VALUES (?)', [
          Buffer.from([0, 255, 7, 128]),
        ]);
        const image = await candidate.closeWithRecoveryImage();
        const pragma = Database.prototype.pragma;
        let inject = true;
        let failure = '';
        Database.prototype.pragma = function (sql: unknown, ...args: unknown[]) {
          if (inject && this.name === filename && sql === 'foreign_keys = ON') {
            inject = false;
            throw new Error('Injected replacement startup failure');
          }
          return pragma.call(this, sql, ...args);
        };
        try {
          await owner.replaceDatabase(image);
        } catch (error) {
          failure = String(error);
        } finally {
          Database.prototype.pragma = pragma;
        }
        const afterFailure = await owner.get('SELECT id FROM cruxes');
        const oldSetting = await owner.get("SELECT value FROM settings WHERE key = 'checkpoint'");
        const previous = await owner.replaceDatabase(image);
        fs.writeFileSync(path.join(folder, 'api-previous-image.db'), Buffer.from(previous));
        return {
          oldRoot: oldRoot.id,
          root: root.id,
          child: child.id,
          failure,
          afterFailure,
          oldSetting,
        };
      } finally {
        await candidate.close();
        await owner.close();
      }
    });
    expect(ids.failure).toContain('Injected replacement startup failure');
    expect(ids.afterFailure).toEqual({ id: ids.oldRoot });
    expect(ids.oldSetting).toEqual({ value: 'original' });
    await launch.app.close();
    launch = await launchApp({ dir });
    const restored = await launch.app.evaluate(async ({ app }, ids) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const folder = app.getPath('userData');
      const owner = await LocalGraphRuntime.open(path.join(folder, 'api-replacement.db'));
      try {
        const result = {
          members: (await owner.listGardenMembers(ids.root)).items.map((item) => item.id),
          setting: await owner.get("SELECT value FROM settings WHERE key = 'checkpoint'"),
          payload: await owner.get('SELECT hex(bytes) AS bytes FROM extension_payload'),
        };
        const previous = Uint8Array.from(
          fs.readFileSync(path.join(folder, 'api-previous-image.db')),
        ).buffer;
        await owner.replaceDatabase(previous);
        return result;
      } finally {
        await owner.close();
      }
    }, ids);
    expect(restored).toEqual({
      members: [ids.child],
      setting: { value: 'incoming' },
      payload: { bytes: '00FF0780' },
    });
    await launch.app.close();
    launch = await launchApp({ dir });
    const rolledBack = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const owner = await LocalGraphRuntime.open(
        path.join(app.getPath('userData'), 'api-replacement.db'),
      );
      try {
        return {
          cruxes: await owner.all('SELECT id FROM cruxes'),
          setting: await owner.get("SELECT value FROM settings WHERE key = 'checkpoint'"),
        };
      } finally {
        await owner.close();
      }
    });
    expect(rolledBack).toEqual({ cruxes: [{ id: ids.oldRoot }], setting: { value: 'original' } });
  } finally {
    await launch.app.close();
  }
});

for (const boundary of ['before', 'after'] as const) {
  test(`API replacement interrupted ${boundary} rename leaves a complete database on restart`, async () => {
    let launch = await launchApp();
    const dir = launch.dir;
    const child = launch.app.process();
    try {
      await launch.app
        .evaluate(async ({ app }, boundary) => {
          const fs = process.getBuiltinModule('fs');
          const path = process.getBuiltinModule('path');
          const load = process
            .getBuiltinModule('module')
            .createRequire(path.join(app.getAppPath(), 'package.json'));
          const { LocalGraphRuntime } = load(
            '@cruxgarden/local-api',
          ) as typeof import('@cruxgarden/local-api');
          const folder = fs.realpathSync(app.getPath('userData'));
          const filename = path.join(folder, 'api-interrupted.db');
          const owner = await LocalGraphRuntime.create(filename);
          await owner.run("INSERT INTO settings VALUES ('checkpoint', 'original')");
          const candidate = await LocalGraphRuntime.create(path.join(folder, 'api-incoming.db'));
          await candidate.run("INSERT INTO settings VALUES ('checkpoint', 'incoming')");
          const image = await candidate.closeWithRecoveryImage();
          const rename = fs.renameSync;
          fs.renameSync = ((from, to) => {
            if (to !== filename) return rename(from, to);
            if (boundary === 'before') process.kill(process.pid, 'SIGKILL');
            rename(from, to);
            process.kill(process.pid, 'SIGKILL');
          }) as typeof fs.renameSync;
          await owner.replaceDatabase(image);
        }, boundary)
        .catch(() => undefined);
      await expect.poll(() => child.signalCode).toBe('SIGKILL');
      launch = await launchApp({ dir });
      const result = await launch.app.evaluate(async ({ app }) => {
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const owner = await LocalGraphRuntime.open(
          path.join(app.getPath('userData'), 'api-interrupted.db'),
        );
        try {
          return {
            setting: await owner.get("SELECT value FROM settings WHERE key = 'checkpoint'"),
            integrity: await owner.get('PRAGMA integrity_check'),
          };
        } finally {
          await owner.close();
        }
      });
      expect(result).toEqual({
        setting: { value: boundary === 'before' ? 'original' : 'incoming' },
        integrity: { integrity_check: 'ok' },
      });
    } finally {
      await launch.app.close();
    }
  });
}
