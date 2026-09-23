import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('manifest Growth retains a connected snapshot through refused writes, edits and desktop restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const saved = await launch.app.evaluate(async ({ app }) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const crypto = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const directory = path.join(app.getPath('userData'), 'growth-content-proof');
      fs.mkdirSync(directory);
      const store = {
        read: async (fp: string) =>
          fs.existsSync(path.join(directory, fp))
            ? fs.readFileSync(path.join(directory, fp))
            : null,
        write: async (fp: string, bytes: Uint8Array) => {
          fs.writeFileSync(path.join(directory, fp), bytes, { flush: true });
        },
      };
      const owner = await LocalGraphRuntime.create(path.join(directory, 'garden.db'));
      try {
        const id = await owner.createCrux({
          slug: crypto.randomUUID(),
          authorId: crypto.randomUUID(),
          homeId: crypto.randomUUID(),
          title: 'Main',
        });
        const file = (text: string) => {
          const bytes = Buffer.from(text);
          return {
            put: {
              id: 'file',
              path: 'document.txt',
              fingerprint: crypto.createHash('sha256').update(bytes).digest('hex'),
              size: bytes.length,
              mimeType: 'text/plain',
              encoding: 'utf-8',
              mode: 0o644,
              attributes: {},
            },
            bytes,
          };
        };
        const head = await owner.editFileContent(
          { cruxId: id, expected: null, changes: [file('Original\0content')] },
          store,
        );
        const input = {
          cruxId: id,
          expected: head,
          snapshotId: crypto.randomUUID(),
          parentId: null,
          meta: {
            messages: [{ role: 'user', content: 'Remember this version' }],
            cumulativeMessageCount: 1,
          },
          dimensionMeta: { label: 'First moment' },
        };
        await owner.run(
          "CREATE TRIGGER refuse_growth BEFORE INSERT ON dimensions BEGIN SELECT RAISE(ABORT, 'Growth refused'); END",
        );
        let refused = false;
        try {
          await owner.createGrowthSnapshot(input, store);
        } catch (error) {
          refused = (error as Error).message.includes('Growth refused');
        }
        const partial = await owner.all("SELECT id FROM cruxes WHERE kind = 'snapshot'");
        const partialHeads = await owner.all(
          'SELECT crux_id FROM file_content_heads WHERE crux_id = ?',
          [input.snapshotId],
        );
        await owner.run('DROP TRIGGER refuse_growth');
        const beforeObjects = fs.readdirSync(directory).sort();
        const result = await owner.createGrowthSnapshot(input, store);
        const afterObjects = fs.readdirSync(directory).sort();
        fs.writeFileSync(
          path.join(directory, 'checkpoint.db'),
          Buffer.from(await owner.exportDatabase()),
          { flush: true },
        );
        const latest = await owner.editFileContent(
          { cruxId: id, expected: head, changes: [file('Later content')] },
          store,
        );
        return {
          id,
          input,
          result,
          latest,
          refused,
          partial,
          partialHeads,
          beforeObjects,
          afterObjects,
        };
      } finally {
        await owner.close();
      }
    });
    expect(saved.refused).toBe(true);
    expect(saved.partial).toEqual([]);
    expect(saved.partialHeads).toEqual([]);
    expect(saved.afterObjects).toEqual(saved.beforeObjects);
    expect(saved.result.growth).toMatchObject({
      sourceId: saved.id,
      targetId: saved.input.snapshotId,
      type: 'growth',
    });
    await launch.app.close();
    launch = await launchApp({ dir });
    const reopened = await launch.app.evaluate(async ({ app }, saved) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, inspectDesktopManifestRecovery } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const directory = path.join(app.getPath('userData'), 'growth-content-proof');
      const store = {
        read: async (fp: string) =>
          fs.existsSync(path.join(directory, fp))
            ? fs.readFileSync(path.join(directory, fp))
            : null,
      };
      const owner = await LocalGraphRuntime.open(path.join(directory, 'garden.db'));
      try {
        const snapshot = await owner.readFileContent(
          { cruxId: saved.input.snapshotId, expected: saved.result.head, path: 'document.txt' },
          store,
        );
        const current = await owner.readFileContent(
          { cruxId: saved.id, expected: saved.latest, path: 'document.txt' },
          store,
        );
        const next = await owner.createGrowthSnapshot(
          {
            ...saved.input,
            expected: saved.latest,
            snapshotId: process.getBuiltinModule('crypto').randomUUID(),
            parentId: saved.input.snapshotId,
          },
          store,
        );
        const image = await owner.exportDatabase();
        await inspectDesktopManifestRecovery(image, store);
        const original = path.join(directory, snapshot!.entry.fingerprint);
        const originalBytes = fs.readFileSync(original);
        fs.unlinkSync(original);
        let missingRefused = false;
        try {
          await inspectDesktopManifestRecovery(image, store);
        } catch {
          missingRefused = true;
        }
        fs.writeFileSync(original, originalBytes, { flush: true });
        await inspectDesktopManifestRecovery(image, store);
        const checkpoint = Uint8Array.from(
          fs.readFileSync(path.join(directory, 'checkpoint.db')),
        ).buffer;
        const rollback = await owner.replaceDatabaseWithContent(checkpoint, store);
        const restoredHead = await owner.fileContentHead(saved.id);
        const restoredFile = await owner.readFileContent(
          { cruxId: saved.id, expected: restoredHead!, path: 'document.txt' },
          store,
        );
        await owner.replaceDatabaseWithContent(rollback, store);
        const restoredLatest = await owner.fileContentHead(saved.id);
        return {
          restoredHead,
          restoredContent: Buffer.from(restoredFile!.bytes).toString(),
          restoredLatest,
          snapshot: Buffer.from(snapshot!.bytes).toString(),
          current: Buffer.from(current!.bytes).toString(),
          meta: next.snapshot.meta,
          artifacts: await owner.all('SELECT * FROM artifacts'),
          missingRefused,
        };
      } finally {
        await owner.close();
      }
    }, saved);
    expect(reopened.snapshot).toBe('Original\0content');
    expect(reopened.current).toBe('Later content');
    expect(reopened.restoredHead).toEqual(saved.input.expected);
    expect(reopened.restoredContent).toBe('Original\0content');
    expect(reopened.restoredLatest).toEqual(saved.latest);
    expect(reopened.meta).toMatchObject({
      contentOwnerId: saved.id,
      parentCruxId: saved.input.snapshotId,
      messages: saved.input.meta.messages,
    });
    expect(reopened.artifacts).toEqual([]);
    expect(reopened.missingRefused).toBe(true);
  } finally {
    await launch.app.close();
  }
});
