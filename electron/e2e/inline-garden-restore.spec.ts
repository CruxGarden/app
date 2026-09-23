import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

for (const format of ['zip', 'raw'] as const) {
  test(`API-owned Garden imports legacy inline ${format}, refuses damage, and survives retry/restart`, async () => {
    const env = { CRUX_API_OWNER: '1' };
    let launch = await launchApp({ env });
    const dir = launch.dir;
    const archive = join(dir, 'export.garden');
    const legacy = join(dir, 'inline.garden');
    const incomplete = join(dir, 'incomplete.garden');
    try {
      let page = launch.page;
      await enterGarden(page);
      const id = await createCrux(page, 'Inline legacy work');
      const originalFolder = await page.evaluate(async (id) => {
        const row = (await window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [
          id,
        ])) as { meta: string };
        return JSON.parse(row.meta).projectFolder as string;
      }, id);

      for (const [filename, value] of [
        ['original.txt', 'Current original'],
        ['external.txt', 'Retained external'],
      ]) {
        await addArtifact(page, filename);
        await page.locator('.monaco-editor').click();
        await page.keyboard.type(value);
        await page.keyboard.press('ControlOrMeta+s');
      }
      const content = (filename: string) =>
        page.evaluate(
          async ({ id, filename }) => {
            const db = window.electronAPI!.sqlite;
            const row = (await db.get(
              'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
              [id, filename],
            )) as { fingerprint: string } | undefined;
            return row ? Array.from(await db.blobRead(row.fingerprint)) : null;
          },
          { id, filename },
        );
      await expect
        .poll(() => content('external.txt'))
        .toEqual(Array.from(Buffer.from('Retained external')));
      await togglePanel(page, 'Toggle settings');
      await page
        .getByTestId('pane-body-settings')
        .getByRole('button', { name: 'Garden', exact: true })
        .click();
      await launch.app.evaluate(({ session }, destination) => {
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(destination);
          item.once('done', (_event, state) => {
            (globalThis as any).__inlineExport = state;
          });
        });
      }, archive);
      await page.getByRole('button', { name: 'Export garden', exact: true }).click();
      await expect
        .poll(() => launch.app.evaluate(() => (globalThis as any).__inlineExport))
        .toBe('completed');
      const fingerprint = await launch.app.evaluate(
        async ({ app }, { archive, legacy, incomplete, id, format }) => {
          const fs = process.getBuiltinModule('fs');
          const path = process.getBuiltinModule('path');
          const { createHash, randomUUID } = process.getBuiltinModule('crypto');
          const load = process
            .getBuiltinModule('module')
            .createRequire(path.join(app.getAppPath(), 'package.json'));
          const JSZip = load('jszip');
          const Database = load('better-sqlite3');
          const zip = await JSZip.loadAsync(fs.readFileSync(archive));
          const bytes = await zip.file('garden.sqlite').async('nodebuffer');
          if (bytes[18] === 2 && bytes[19] === 2) bytes[18] = bytes[19] = 1;
          const db = new Database(bytes);
          const text = Buffer.from('Recovered legacy 🌱');
          let image: Buffer;
          let external: string;
          try {
            db.exec(
              'ALTER TABLE artifacts ADD COLUMN content BLOB; UPDATE schema_version SET version = 1;',
            );
            const row = db
              .prepare('SELECT * FROM artifacts WHERE resource_id = ? AND path = ?')
              .get(id, 'original.txt');
            db.prepare(
              'UPDATE artifacts SET content = ?, fingerprint = NULL, size = ? WHERE id = ?',
            ).run(text, text.length, row.id);
            for (const [name, content] of [
              ['binary.bin', Buffer.from([0, 255, 128, 7])],
              ['empty.txt', Buffer.alloc(0)],
            ] as const)
              db.prepare(
                `INSERT INTO artifacts (id, resource_id, author_id, home_id, path, filename, content, size, created, updated)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              ).run(
                randomUUID(),
                id,
                row.author_id,
                row.home_id,
                name,
                name,
                content,
                content.length,
                row.created,
                row.updated,
              );
            external = db
              .prepare('SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?')
              .get(id, 'external.txt').fingerprint;
            image = db.serialize();
          } finally {
            db.close();
          }
          zip.file('garden.sqlite', image);
          const manifest = JSON.parse(await zip.file('manifest.json').async('text'));
          manifest.fingerprint = createHash('sha256').update(image).digest('hex');
          zip.file('manifest.json', JSON.stringify(manifest));
          fs.writeFileSync(
            legacy,
            format === 'raw' ? image : await zip.generateAsync({ type: 'nodebuffer' }),
          );
          zip.remove(`artifacts/${external}`);
          zip.file(
            'manifest.json',
            JSON.stringify({ ...manifest, artifactCount: manifest.artifactCount - 1 }),
          );
          fs.writeFileSync(incomplete, await zip.generateAsync({ type: 'nodebuffer' }));
          return createHash('sha256').update(text).digest('hex');
        },
        { archive, legacy, incomplete, id, format },
      );
      await togglePanel(page, 'Toggle settings');
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page.getByRole('button', { name: 'Close Inline legacy work workspace' }).click();
      await page.getByRole('button', { name: 'Save and close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const openSettings = async () => {
        await page.getByRole('button', { name: 'Account menu' }).click();
        await page.getByRole('button', { name: /^Settings/ }).click();
        await page
          .getByRole('dialog', { name: 'Settings', exact: true })
          .getByRole('button', { name: 'Garden', exact: true })
          .click();
      };
      const restore = async (source: string) => {
        await page.locator('input[type=file][accept=".garden"]').setInputFiles(source);
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
      };
      await openSettings();
      if (format === 'zip') {
        await restore(incomplete);
        await expect(page.getByText(/missing required content/)).toBeVisible();
      }
      await launch.app.evaluate(({ app }, fingerprint) => {
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { NativeBlobStore } = load('./dist/native-blobs.js');
        const write = NativeBlobStore.prototype.blobWrite;
        NativeBlobStore.prototype.blobWrite = function (fp: string, bytes: Uint8Array) {
          if (fp === fingerprint) throw new Error('Injected inline conversion disk full');
          return write.call(this, fp, bytes);
        };
      }, fingerprint);
      await restore(legacy);
      await expect(page.getByText(/Injected inline conversion disk full/)).toBeVisible();
      expect(await content('original.txt')).toEqual(Array.from(Buffer.from('Current original')));
      await launch.app.close();
      launch = await launchApp({ env, dir });
      page = launch.page;
      await page.getByRole('button', { name: /enter/i }).click();
      expect(await content('original.txt')).toEqual(Array.from(Buffer.from('Current original')));
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      await openSettings();
      await restore(legacy);
      await expect
        .poll(() => content('original.txt'))
        .toEqual(Array.from(Buffer.from('Recovered legacy 🌱')));
      await expect(page.getByRole('button', { name: /enter/i })).toBeVisible();
      await launch.app.close();
      launch = await launchApp({ env, dir });
      page = launch.page;
      await page.getByRole('button', { name: /enter/i }).click();
      expect(await content('original.txt')).toEqual(Array.from(Buffer.from('Recovered legacy 🌱')));
      expect(await content('binary.bin')).toEqual([0, 255, 128, 7]);
      expect(await content('empty.txt')).toEqual([]);
      expect(await content('external.txt')).toEqual(Array.from(Buffer.from('Retained external')));
      const projected = await page.evaluate(
        async ({ id, originalFolder }) => {
          const api = window.electronAPI!;
          const row = (await api.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [id])) as {
            meta: string;
          };
          const folder = JSON.parse(row.meta).projectFolder as string;
          return {
            fresh: folder !== originalFolder,
            text: new TextDecoder().decode(await api.project.readFile(folder, 'original.txt')),
            binary: Array.from(await api.project.readFile(folder, 'binary.bin')),
            empty: Array.from(await api.project.readFile(folder, 'empty.txt')),
            previous: new TextDecoder().decode(
              await api.project.readFile(originalFolder, 'original.txt'),
            ),
          };
        },
        { id, originalFolder },
      );
      expect(projected).toEqual({
        fresh: true,
        text: 'Recovered legacy 🌱',
        binary: [0, 255, 128, 7],
        empty: [],
        previous: 'Current original',
      });

      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Inline legacy work',
      );
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', id);
      if (!(await page.getByTestId('pane-body-artifacts').isVisible()))
        await togglePanel(page, 'Toggle artifacts');
      await page.getByRole('tree').getByText('original.txt', { exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Recovered legacy');
      expect(await content('original.txt')).toEqual(Array.from(Buffer.from('Recovered legacy 🌱')));

      expect(
        await page.evaluate(() =>
          window.electronAPI!.sqlite.get('SELECT version FROM schema_version'),
        ),
      ).toEqual({ version: 4 });
    } finally {
      await launch.app.close();
    }
  });
}
