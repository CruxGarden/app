import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import {
  createCrux,
  enterGarden,
  reenterWorkspace,
  storedCrux,
  switchCrux,
} from './multi-crux-helpers';
import { closeWorkspace, writeFirstFile } from './journeys/journey-helpers';
import { openPanel } from './panel-helpers';

const row = (page: Page) => page.getByRole('tree').getByText('target.txt', { exact: true });

async function nativeText(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const api = window.electronAPI!.sqlite.fileContent!;
    const head = await api.head(id);
    if (!head) return null;
    try {
      const file = await api.read({ cruxId: id, expected: head, path: 'target.txt' });
      return file ? new TextDecoder().decode(new Uint8Array(file.bytes)) : null;
    } catch (error) {
      // A watcher may advance the manifest between these two real IPC reads.
      // The surrounding poll must select a fresh head, never bypass that fence.
      if (String(error).includes('File content changed; reload before reading')) return null;
      throw error;
    }
  }, id);
}

async function expectProtected(page: Page, id: string, text: string, count?: number) {
  const fingerprint = createHash('sha256').update(text).digest('hex');
  const retained = await page.evaluate(async (id) => {
    const api = window.electronAPI!.sqlite.fileContent!;
    const history = await api.history(id);
    const selected = await Promise.all(
      history.checkpoints
        .filter((item) => item.reason === 'safety')
        .map((item) => api.inspectCheckpoint(id, item.id)),
    );
    return {
      count: selected.length,
      fingerprints: selected.flatMap((item) => item.files.map((file) => file.fingerprint)),
    };
  }, id);
  expect(retained.fingerprints).toContain(fingerprint);
  if (count !== undefined) expect(retained.count).toBe(count);
}

async function upload(page: Page) {
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Files…', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'target.txt', mimeType: 'text/plain', buffer: Buffer.from('Imported') });
  const dialog = page.getByRole('dialog').filter({ hasText: 'already exists' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function remove(page: Page) {
  await row(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Delete this file?' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** An outside writer changes the real disk file at the native admission boundary. */
async function externalEditAtAdmission(
  app: ElectronApplication,
  operation: 'write' | 'delete',
  text: string,
) {
  await app.evaluate(
    ({ app }, { operation, text }) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { ProjectFolders } = load('./dist/projects.js') as typeof import('../src/projects');
      const original = ProjectFolders.prototype.projectOperation;
      ProjectFolders.prototype.projectOperation = function (folder, intent, apply, bytes) {
        const file = intent.kind === 'write' ? intent.entry.path : intent.source.path;
        if (!apply && intent.kind === operation && file === 'target.txt') {
          ProjectFolders.prototype.projectOperation = original;
          fs.writeFileSync(path.join(folder, file), text);
        }
        return original.call(this, folder, intent, apply, bytes);
      };
    },
    { operation, text },
  );
}

async function refuseDatabaseDelete(app: ElectronApplication) {
  await app.evaluate(({ app }) => {
    const path = process.getBuiltinModule('path');
    const load = process
      .getBuiltinModule('module')
      .createRequire(path.join(app.getAppPath(), 'package.json'));
    const { LocalGraphRuntime } = load(
      '@cruxgarden/local-api',
    ) as typeof import('@cruxgarden/local-api');
    const original = LocalGraphRuntime.prototype.deleteFileContent;
    LocalGraphRuntime.prototype.deleteFileContent = async function (...args) {
      LocalGraphRuntime.prototype.deleteFileContent = original;
      await this.run(
        "CREATE TRIGGER refuse_file_delete BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Storage refused'); END",
      );
      try {
        return await original.apply(this, args);
      } finally {
        await this.run('DROP TRIGGER refuse_file_delete');
      }
    };
  });
}

for (const operation of ['upload', 'delete'] as const) {
  test(`${operation} consent preserves later indexed and unindexed edits; explicit retry keeps protected history`, async () => {
    const testInfo = test.info();
    test.setTimeout(180_000);
    const { app, page } = await launchApp({ ai: false });
    try {
      await enterGarden(page);
      const id = await createCrux(page, `Protected ${operation}`);
      await writeFirstFile(page, 'target.txt', 'At consent');
      const folder = (await storedCrux(page, id)).projectFolder;
      await expect.poll(() => nativeText(page, id)).toBe('At consent');
      expect(
        await page.evaluate(
          async (id) =>
            (await window.electronAPI!.sqlite.fileContent!.history(id)).checkpoints.filter(
              (checkpoint) => checkpoint.reason === 'safety',
            ).length,
          id,
        ),
      ).toBe(0);
      const ask = () => (operation === 'upload' ? upload(page) : remove(page));
      const label = operation === 'upload' ? 'Replace' : 'Delete';
      let confirmation = await ask();
      writeFileSync(join(folder, 'target.txt'), 'New indexed edit');
      await expect.poll(() => nativeText(page, id)).toBe('New indexed edit');
      await confirmation.getByRole('button', { name: label, exact: true }).click();
      const failure = page.getByRole('alertdialog', {
        name: operation === 'upload' ? 'Upload failed' : 'Delete failed',
        exact: true,
      });
      await expect(failure).toContainText('target.txt');
      expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('New indexed edit');
      await failure.getByRole('button', { name: 'OK', exact: true }).click();
      await expect(row(page)).toBeVisible();

      await externalEditAtAdmission(
        app,
        operation === 'upload' ? 'write' : 'delete',
        'New unindexed edit',
      );
      confirmation = await ask();
      await confirmation.getByRole('button', { name: label, exact: true }).click();
      await expect(failure).toContainText('target.txt');
      expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('New unindexed edit');
      await failure.getByRole('button', { name: 'OK', exact: true }).click();
      await expect.poll(() => nativeText(page, id)).toBe('New unindexed edit');
      await page.screenshot({ path: testInfo.outputPath(`${operation}-later-edit-kept.png`) });

      confirmation = await ask();
      await confirmation.getByRole('button', { name: label, exact: true }).click();
      if (operation === 'upload') await expect.poll(() => nativeText(page, id)).toBe('Imported');
      else await expect(row(page)).toHaveCount(0);
      await expectProtected(page, id, 'New unindexed edit', 1);
      if (operation === 'upload')
        expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Imported');
      else expect(existsSync(join(folder, 'target.txt'))).toBe(false);
    } finally {
      await app.close();
    }
  });
}

test('database refusal keeps the deleted file and editor intact; retry after restart removes it with protected history', async () => {
  const testInfo = test.info();
  test.setTimeout(180_000);
  let instance = await launchApp({ ai: false });
  const { dir } = instance;
  try {
    let page = instance.page;
    await enterGarden(page);
    const id = await createCrux(page, 'Delete refusal');
    const editor = await writeFirstFile(page, 'target.txt', 'Retained after refusal');
    const folder = (await storedCrux(page, id)).projectFolder;
    await expect.poll(() => nativeText(page, id)).toBe('Retained after refusal');
    await refuseDatabaseDelete(instance.app);
    await (await remove(page)).getByRole('button', { name: 'Delete', exact: true }).click();
    const failure = page.getByRole('alertdialog', { name: 'Delete failed', exact: true });
    await expect(failure).toContainText('target.txt');
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Retained after refusal');
    expect(await nativeText(page, id)).toBe('Retained after refusal');
    await failure.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(row(page)).toBeVisible();
    await expect(editor).toContainText('Retained after refusal');
    await page.screenshot({ path: testInfo.outputPath('delete-storage-refusal.png') });
    await instance.app.close();
    instance = await launchApp({ dir, ai: false });
    page = instance.page;
    await reenterWorkspace(page, 'Delete refusal');
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Retained after refusal');
    expect(await nativeText(page, id)).toBe('Retained after refusal');
    await (await remove(page)).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row(page)).toHaveCount(0);
    expect(existsSync(join(folder, 'target.txt'))).toBe(false);
    await expectProtected(page, id, 'Retained after refusal');
  } finally {
    await instance.app.close();
  }
});

/** Fail the real filesystem receipt after the native operation changes disk.
 * The committed intent must be resumed, not submitted as another user mutation. */
async function refuseReceipt(app: ElectronApplication, kind: 'write' | 'delete' | 'rename') {
  await app.evaluate((_, kind) => {
    const fs = process.getBuiltinModule('fs');
    const path = process.getBuiltinModule('path');
    const original = fs.writeFileSync;
    fs.writeFileSync = function (...args) {
      if (
        typeof args[0] === 'string' &&
        args[0].includes(`${path.sep}.crux-recovery${path.sep}${kind}${path.sep}`) &&
        args[0].endsWith(`${path.sep}completed.json`)
      ) {
        fs.writeFileSync = original;
        throw new Error('File receipt unavailable');
      }
      return original.apply(this, args);
    };
  }, kind);
}

async function fileUpdateState(page: Page, owner: string) {
  return page.evaluate(async (owner) => {
    const sqlite = window.electronAPI!.sqlite;
    const record = (await sqlite.get('SELECT value FROM settings WHERE key = ?', [
      `cruxgarden:content-projection:${owner}`,
    ])) as { value: string } | null;
    return {
      pending: record ? JSON.parse(record.value) : null,
      head: await sqlite.fileContent!.head(owner),
      history: (await sqlite.fileContent!.history(owner)).checkpoints,
    };
  }, owner);
}

async function changeFile(page: Page, kind: 'write' | 'delete' | 'rename') {
  if (kind === 'write')
    await (await upload(page)).getByRole('button', { name: 'Replace', exact: true }).click();
  else if (kind === 'delete')
    await (await remove(page)).getByRole('button', { name: 'Delete', exact: true }).click();
  else {
    await row(page).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const name = page.getByRole('tree').getByRole('textbox');
    await name.fill('renamed.txt');
    await name.press('Enter');
  }
}

for (const kind of ['write', 'delete', 'rename'] as const) {
  test(`${kind} with a refused receipt offers recovery of the saved update without repeating it`, async () => {
    const testInfo = test.info();
    test.setTimeout(180_000);
    let instance = await launchApp({ ai: false });
    const { dir } = instance;
    try {
      let page = instance.page;
      const title = `Recover ${kind}`;
      await enterGarden(page);
      const id = await createCrux(page, title);
      await writeFirstFile(page, 'target.txt', 'Before recovery');
      await expect.poll(() => nativeText(page, id)).toBe('Before recovery');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      await refuseReceipt(instance.app, kind);
      await changeFile(page, kind);
      const recovery = page.getByRole('dialog', { name: 'File update pending', exact: true });
      await expect(recovery).toContainText('saved in Garden');
      await expect(
        recovery.getByRole('button', { name: 'Retry file update', exact: true }),
      ).toBeVisible();
      const admitted = await fileUpdateState(page, id);
      expect(admitted.pending?.operation.kind).toBe(kind);
      const stage = join(folder, '.crux-recovery', kind, admitted.pending.operation.operationId);
      expect(existsSync(join(stage, 'completed.json'))).toBe(false);
      if (kind === 'delete') expect(existsSync(join(folder, 'target.txt'))).toBe(false);
      else
        expect(
          readFileSync(join(folder, kind === 'rename' ? 'renamed.txt' : 'target.txt'), 'utf8'),
        ).toBe(kind === 'rename' ? 'Before recovery' : 'Imported');
      await page.screenshot({ path: testInfo.outputPath(`${kind}-update-pending.png`) });
      await recovery.getByRole('button', { name: 'Retry file update', exact: true }).click();
      await expect.poll(async () => (await fileUpdateState(page, id)).pending).toBeNull();
      const recovered = await fileUpdateState(page, id);
      expect(recovered.head).toEqual(admitted.head);
      expect(recovered.history).toEqual(admitted.history);
      expect(existsSync(join(stage, 'completed.json'))).toBe(true);
      if (kind === 'delete') await expect(row(page)).toHaveCount(0);
      else
        await expect(
          page
            .getByRole('tree')
            .getByText(kind === 'rename' ? 'renamed.txt' : 'target.txt', { exact: true }),
        ).toBeVisible();
      // A later file edit (or recreation after deletion) is new work. Recovery
      // must not overwrite/delete it when the Garden is reopened.
      const livePath = kind === 'rename' ? 'renamed.txt' : 'target.txt';
      writeFileSync(join(folder, livePath), 'Later external work');
      await instance.app.close();
      instance = await launchApp({ dir, ai: false });
      page = instance.page;
      await reenterWorkspace(page, title);
      expect(readFileSync(join(folder, livePath), 'utf8')).toBe('Later external work');
      expect((await fileUpdateState(page, id)).pending).toBeNull();
    } finally {
      await instance.app.close();
    }
  });
}

test('reopening a Crux finishes a saved file update left for later without a new upload', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    const title = 'Recover on reopen';
    const id = await createCrux(page, title);
    await writeFirstFile(page, 'target.txt', 'Before recovery');
    await expect.poll(() => nativeText(page, id)).toBe('Before recovery');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    await refuseReceipt(app, 'write');
    await changeFile(page, 'write');
    const recovery = page.getByRole('dialog', { name: 'File update pending', exact: true });
    await expect(recovery).toContainText('saved in Garden');
    const admitted = await fileUpdateState(page, id);
    expect(admitted.pending?.operation.kind).toBe('write');
    await recovery.getByRole('button', { name: 'Later', exact: true }).click();
    await closeWorkspace(page, title);
    await switchCrux(page, title);
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    await expect(row(page)).toBeVisible();
    await expect.poll(async () => (await fileUpdateState(page, id)).pending).toBeNull();
    const recovered = await fileUpdateState(page, id);
    expect(recovered.head).toEqual(admitted.head);
    expect(recovered.history).toEqual(admitted.history);
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Imported');
  } finally {
    await app.close();
  }
});
