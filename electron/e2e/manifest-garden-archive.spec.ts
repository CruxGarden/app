import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

async function openData(page: Page) {
  // No project is open in either installation; Settings is reached from Home.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('button', { name: 'Garden', exact: true })
    .click();
}
async function importArchive(page: Page, file: string) {
  await page.locator('input[type=file][accept=".garden"]').setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
}

test('Settings backs up the manifest graph, refuses cache-masked missing history and restores into a fresh installation', async () => {
  let launch = await launchApp();
  const source = launch.dir;
  const archive = join(launch.dir, 'manifest.garden');
  const incomplete = join(launch.dir, 'missing-history.garden');
  try {
    await enterGarden(launch.page);
    const saved = await launch.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const root = await db.enterLocalGarden!();
      const id = await db.createCrux!({
        slug: `archive-${crypto.randomUUID()}`,
        title: 'Manifest history',
        type: 'workspace',
        authorId: crypto.randomUUID(),
        homeId: crypto.randomUUID(),
      });
      await db.gardenMembership!.add({ gardenId: root.id, memberId: id });
      const file = async (text: string) => {
        const bytes = new TextEncoder().encode(text);
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        return {
          put: {
            id: 'document',
            path: 'document.bin',
            fingerprint,
            size: bytes.length,
            mimeType: 'application/octet-stream',
            encoding: 'binary',
            mode: 0o640,
            attributes: { note: 'Keep this attribute' },
          },
          bytes,
        };
      };
      const original = await file('Retained\0history');
      const first = await content.edit({ cruxId: id, expected: null, changes: [original] });
      const snapshot = await content.snapshot({
        cruxId: id,
        expected: first,
        snapshotId: crypto.randomUUID(),
        parentId: null,
        meta: { messages: [{ role: 'user', content: 'Keep this conversation' }] },
        dimensionMeta: { label: 'Before editing' },
      });
      const latest = await content.edit({
        cruxId: id,
        expected: first,
        changes: [await file('Current\0content')],
      });
      return { id, root, first, snapshot, latest, fingerprint: original.put.fingerprint };
    });
    await openData(launch.page);
    await launch.app.evaluate(({ session }, destination) => {
      session.defaultSession.once('will-download', (_e, item) => {
        item.setSavePath(destination);
        item.once('done', (_e, state) => {
          (globalThis as any).__manifestExport = state;
        });
      });
    }, archive);
    await launch.page.getByRole('button', { name: 'Export garden', exact: true }).click();
    await expect
      .poll(() => launch.app.evaluate(() => (globalThis as any).__manifestExport))
      .toBe('completed');
    const metadata = await launch.app.evaluate(
      async ({ app }, { archive, incomplete, saved }) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const zip = await load('jszip').loadAsync(fs.readFileSync(archive));
        const manifest = JSON.parse(await zip.file('manifest.json').async('text'));
        const rootsPresent = [saved.first.root, saved.latest.root].every(
          (root) => !!zip.file(`artifacts/${root}`),
        );
        const historical = await zip.file(`artifacts/${saved.fingerprint}`).async('string');
        zip.remove(`artifacts/${saved.fingerprint}`);
        zip.file(
          'manifest.json',
          JSON.stringify({ ...manifest, artifactCount: manifest.artifactCount - 1 }),
        );
        fs.writeFileSync(incomplete, await zip.generateAsync({ type: 'nodebuffer' }));
        return { manifest, rootsPresent, historical };
      },
      { archive, incomplete, saved },
    );
    expect(metadata.manifest).toMatchObject({ version: '4.0', scope: 'installation' });
    expect(metadata.rootsPresent).toBe(true);
    expect(metadata.historical).toBe('Retained\0history');
    await importArchive(launch.page, incomplete);
    await expect(launch.page.getByText(/missing required content/)).toBeVisible();
    expect(
      await launch.page.evaluate(
        (id) => window.electronAPI!.sqlite.fileContent!.head(id),
        saved.id,
      ),
    ).toEqual(saved.latest);
    await launch.app.close();
    launch = await launchApp();
    const destination = launch.dir;
    expect(destination).not.toBe(source);
    launch.page.on('pageerror', (error) =>
      console.log('Destination renderer error:', error.message),
    );
    await enterGarden(launch.page);
    // Recovery must replace the destination's installation entry, not retain
    // its root or reinterpret the imported root as another member.
    const destinationRoot = await launch.page.evaluate(() =>
      window.electronAPI!.sqlite.enterLocalGarden!(),
    );
    expect(destinationRoot.id).not.toBe(saved.root.id);
    await openData(launch.page);
    await importArchive(launch.page, archive);
    await expect
      .poll(() =>
        launch.page
          .evaluate(
            (id) => window.electronAPI!.sqlite.fileContent!.head(id).catch(() => null),
            saved.id,
          )
          .catch(() => null),
      )
      .toEqual(saved.latest);
    await launch.app.close();
    launch = await launchApp({ dir: destination });
    const restored = await launch.page.evaluate(async (saved) => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const old = await content.read({
        cruxId: saved.snapshot.snapshot.id,
        expected: saved.snapshot.head,
        path: 'document.bin',
      });
      const current = await content.read({
        cruxId: saved.id,
        expected: saved.latest,
        path: 'document.bin',
      });
      const snapshot = (await db.get('SELECT meta FROM cruxes WHERE id = ?', [
        saved.snapshot.snapshot.id,
      ])) as { meta: string };
      return {
        root: await db.enterLocalGarden!(),
        members: await db.gardenMembership!.list(saved.root.id),
        old: new TextDecoder().decode(old!.bytes),
        current: new TextDecoder().decode(current!.bytes),
        attributes: old!.entry.attributes,
        meta: JSON.parse(snapshot.meta),
        edges: await db.all(
          "SELECT target_id FROM dimensions WHERE type = 'growth' AND source_id = ?",
          [saved.id],
        ),
        folder: JSON.parse(
          ((await db.get('SELECT meta FROM cruxes WHERE id = ?', [saved.id])) as { meta: string })
            .meta,
        ).projectFolder as string,
        snapshotFolder: JSON.parse(snapshot.meta).projectFolder,
        artifacts: await db.all('SELECT id FROM artifacts WHERE resource_id IN (?, ?)', [
          saved.id,
          saved.snapshot.snapshot.id,
        ]),
      };
    }, saved);
    expect(restored).toMatchObject({
      old: 'Retained\0history',
      current: 'Current\0content',
      attributes: { note: 'Keep this attribute' },
      meta: {
        messages: [{ role: 'user', content: 'Keep this conversation' }],
        contentOwnerId: saved.id,
      },
      edges: [{ target_id: saved.snapshot.snapshot.id }],
      artifacts: [],
    });
    expect(restored.root).toEqual(saved.root);
    expect(restored.members.items.map((item) => item.id)).toEqual([saved.id]);
    expect(restored.snapshotFolder).toBeUndefined();
    const disk = await launch.app.evaluate((_electron, folder) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const file = path.join(folder, 'document.bin');
      return { bytes: fs.readFileSync(file).toString(), mode: fs.statSync(file).mode & 0o777 };
    }, restored.folder);
    expect(disk).toEqual({ bytes: 'Current\0content', mode: 0o640 });
    // An edit made while the app is closed must be reconciled from disk into
    // the manifest, without creating a competing Artifact index.
    await launch.app.close();
    const fs = await import('node:fs/promises');
    await fs.writeFile(join(restored.folder, 'document.bin'), 'Offline\0edit');
    await fs.writeFile(join(restored.folder, 'new.txt'), 'New offline file');
    launch = await launchApp({ dir: destination });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    await expect
      .poll(() =>
        launch.page.evaluate(async (id) => {
          const content = window.electronAPI!.sqlite.fileContent!;
          const head = await content.head(id);
          const file = await content.read({ cruxId: id, expected: head!, path: 'document.bin' });
          return new TextDecoder().decode(file!.bytes);
        }, saved.id),
      )
      .toBe('Offline\0edit');
    const recovered = await launch.page.evaluate(async (saved) => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const current = await content.head(saved.id);
      const listing = await content.list({ cruxId: saved.id, expected: current! });
      const old = await content.read({
        cruxId: saved.snapshot.snapshot.id,
        expected: saved.snapshot.head,
        path: 'document.bin',
      });
      return {
        files: listing.entries,
        old: new TextDecoder().decode(old!.bytes),
        rows: await db.all('SELECT id FROM artifacts WHERE resource_id = ?', [saved.id]),
      };
    }, saved);
    expect(recovered.files.map((file) => file.path)).toEqual(['document.bin', 'new.txt']);
    expect(recovered.files[0]).toMatchObject({
      mode: 0o640,
      attributes: { note: 'Keep this attribute' },
    });
    expect(recovered.old).toBe('Retained\0history');
    expect(recovered.rows).toEqual([]);
    await launch.page.evaluate(
      (folder) => window.electronAPI!.project.watch(folder),
      restored.folder,
    );
    await fs.writeFile(join(restored.folder, 'document.bin'), 'Live\0edit');
    await fs.unlink(join(restored.folder, 'new.txt'));
    await expect
      .poll(() =>
        launch.page.evaluate(async (id) => {
          const content = window.electronAPI!.sqlite.fileContent!;
          const head = await content.head(id);
          const listing = await content.list({ cruxId: id, expected: head! });
          const file = await content.read({ cruxId: id, expected: head!, path: 'document.bin' });
          return {
            paths: listing.entries.map((entry) => entry.path),
            bytes: new TextDecoder().decode(file!.bytes),
          };
        }, saved.id),
      )
      .toEqual({ paths: ['document.bin'], bytes: 'Live\0edit' });
    expect(await fs.readFile(join(restored.folder, 'document.bin'), 'utf8')).toBe('Live\0edit');
  } finally {
    await launch.app.close();
  }
});
