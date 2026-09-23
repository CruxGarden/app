import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('API file content publication retains old and staged bytes through failed commit and Electron restart', async () => {
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
      const { LocalGraphRuntime, FileManifest, inspectDesktopRecovery } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      // Candidate schema is installed only in this disposable database, not the app's profile.
      const { FILE_CONTENT_SCHEMA } = load(
        path.join(
          path.dirname(load.resolve('@cruxgarden/local-api')),
          'file-content.repository.js',
        ),
      );
      const directory = path.join(app.getPath('userData'), 'file-content-proof');
      fs.mkdirSync(directory);
      const store = {
        read: async (fp: string) => {
          try {
            return fs.readFileSync(path.join(directory, fp));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
          }
        },
        write: async (fp: string, bytes: Uint8Array) => {
          fs.writeFileSync(path.join(directory, fp), bytes, { flush: true });
        },
      };
      const owner = await LocalGraphRuntime.create(path.join(directory, 'garden.db'));
      try {
        const id = await owner.createCrux({
          title: 'Content',
          slug: crypto.randomUUID(),
          authorId: crypto.randomUUID(),
          homeId: crypto.randomUUID(),
        });
        const tree = new FileManifest(store);
        const stage = async (content: string) => {
          const bytes = Buffer.from(content);
          const fingerprint = crypto.createHash('sha256').update(bytes).digest('hex');
          await store.write(fingerprint, bytes);
          return tree.apply(null, [
            {
              put: {
                id: 'file',
                path: 'image.bin',
                fingerprint,
                size: bytes.length,
                mimeType: 'application/octet-stream',
                encoding: 'binary',
                mode: 0o644,
                attributes: { label: 'Retained' },
              },
            },
          ]);
        };
        const first = await stage('Original\0bytes');
        let unadopted = false;
        try {
          await owner.commitFileContent({ cruxId: id, expected: null, root: first }, store);
        } catch (error) {
          unadopted = (error as Error).message.includes('not been adopted');
        }
        await owner.run(FILE_CONTENT_SCHEMA);
        const head = await owner.commitFileContent(
          { cruxId: id, expected: null, root: first },
          store,
        );
        const candidate = await stage('Updated\0bytes');
        await owner.run(
          "CREATE TRIGGER refuse_content BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Commit refused'); END",
        );
        let refused = false;
        try {
          await owner.commitFileContent({ cruxId: id, expected: head, root: candidate }, store);
        } catch (error) {
          refused = (error as Error).message.includes('Commit refused');
        }
        let recoveryRefused = false;
        try {
          inspectDesktopRecovery(await owner.exportDatabase());
        } catch (error) {
          recoveryRefused = (error as Error).message.includes('manifest-aware recovery');
        }
        return {
          id,
          head,
          candidate,
          unadopted,
          refused,
          recoveryRefused,
          after: await owner.fileContentHead(id),
        };
      } finally {
        await owner.close();
      }
    });
    expect(saved.unadopted).toBe(true);
    expect(saved.refused).toBe(true);
    expect(saved.recoveryRefused).toBe(true);
    expect(saved.after).toEqual(saved.head);
    await launch.app.close();
    launch = await launchApp({ dir });
    const reopened = await launch.app.evaluate(async ({ app }, saved) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, FileManifest, inspectDesktopManifestRecovery } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const directory = path.join(app.getPath('userData'), 'file-content-proof');
      const store = {
        read: async (fp: string) => fs.readFileSync(path.join(directory, fp)),
        write: async () => {
          throw new Error('Retry must use already staged bytes');
        },
      };
      const owner = await LocalGraphRuntime.open(path.join(directory, 'garden.db'));
      try {
        const before = await owner.fileContentHead(saved.id);
        await owner.run('DROP TRIGGER refuse_content');
        const captured = await owner.exportDatabase();
        const after = await owner.commitFileContent(
          { cruxId: saved.id, expected: saved.head, root: saved.candidate },
          store,
        );
        const tree = new FileManifest(store);
        const files = await Promise.all(
          [saved.head.root, after.root].map(async (root) => {
            const file = (await tree.get(root, 'image.bin'))!;
            return Buffer.from(await store.read(file.fingerprint)).toString();
          }),
        );
        // Inventory the captured image after the live owner has moved on. Copy
        // only that inventory into a fresh store with no source-store fallback.
        const activeFile = await owner.readFileContent(
          { cruxId: saved.id, expected: after, path: 'image.bin' },
          store,
        );
        let staleReadRefused = false;
        try {
          await owner.readFileContent(
            { cruxId: saved.id, expected: saved.head, path: 'image.bin' },
            store,
          );
        } catch (error) {
          staleReadRefused = (error as Error).message.includes('File content changed');
        }
        const inventory = await inspectDesktopManifestRecovery(captured, store);
        const destination = path.join(directory, 'detached-recovery');
        fs.mkdirSync(destination);
        fs.writeFileSync(path.join(destination, 'garden.db'), Buffer.from(inventory.database));
        for (const fp of inventory.fingerprints)
          fs.writeFileSync(path.join(destination, fp), await store.read(fp));
        const recoveredStore = {
          read: async (fp: string) => {
            try {
              return fs.readFileSync(path.join(destination, fp));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
              throw error;
            }
          },
          write: async () => {
            throw new Error('Recovery must not stage new content');
          },
        };
        const recovered = await LocalGraphRuntime.open(path.join(destination, 'garden.db'));
        try {
          const recoveredHead = await recovered.fileContentHead(saved.id);
          const recoveredFile = (await recovered.readFileContent(
            { cruxId: saved.id, expected: recoveredHead!, path: 'image.bin' },
            recoveredStore,
          ))!;
          const original = recoveredFile.entry;
          const originalBytes = recoveredFile.bytes;
          fs.unlinkSync(path.join(destination, original.fingerprint));
          let missingRefused = false;
          try {
            await inspectDesktopManifestRecovery(inventory.database, recoveredStore);
          } catch {
            missingRefused = true;
          }
          fs.writeFileSync(path.join(destination, original.fingerprint), originalBytes);
          const retry = await inspectDesktopManifestRecovery(inventory.database, recoveredStore);
          return {
            before,
            after,
            files,
            artifacts: await owner.all('SELECT * FROM artifacts'),
            recoveredHead,
            activeFile: Buffer.from(activeFile!.bytes).toString(),
            staleReadRefused,
            original: Buffer.from(originalBytes).toString(),
            missingRefused,
            retainedOldRoot: retry.fingerprints.includes(saved.head.root),
            excludesLaterRoot: !retry.fingerprints.includes(saved.candidate),
          };
        } finally {
          await recovered.close();
        }
      } finally {
        await owner.close();
      }
    }, saved);
    expect(reopened.before).toEqual(saved.head);
    expect(reopened.after).toEqual({ ...saved.head, root: saved.candidate, revision: 2 });
    expect(reopened.files).toEqual(['Original\0bytes', 'Updated\0bytes']);
    expect(reopened.artifacts).toEqual([]);
    expect(reopened.recoveredHead).toEqual(saved.head);
    expect(reopened.activeFile).toBe('Updated\0bytes');
    expect(reopened.staleReadRefused).toBe(true);
    expect(reopened.original).toBe('Original\0bytes');
    expect(reopened.missingRefused).toBe(true);
    expect(reopened.retainedOldRoot).toBe(true);
    expect(reopened.excludesLaterRoot).toBe(true);
  } finally {
    await launch.app.close();
  }
});
