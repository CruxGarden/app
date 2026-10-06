import { test, expect, type ElectronApplication } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { createCrux, enterGarden, storedCrux, storedFingerprint } from './multi-crux-helpers';
import { chooseSettingsSection, showPane } from './panel-helpers';
import { closeWorkspace, connectAccount, writeFirstFile } from './journeys/journey-helpers';

type ExportPause = { held: boolean; resume?: () => void; restore: () => void };
type PausedMain = typeof globalThis & {
  __cruxGardenBackupPause?: ExportPause;
  __cruxGardenImportPause?: ExportPause;
};

/** Pause one real database export before it acquires the database; its result is unchanged. */
async function pauseExport(app: ElectronApplication) {
  await app.evaluate(({ app }) => {
    const path = process.getBuiltinModule('path');
    const load = process
      .getBuiltinModule('module')
      .createRequire(path.join(app.getAppPath(), 'package.json'));
    const { LocalGraphRuntime } = load(
      '@cruxgarden/local-api',
    ) as typeof import('@cruxgarden/local-api');
    const native = LocalGraphRuntime.prototype;
    const original = native.exportDatabase;
    const state: ExportPause = {
      held: false,
      restore: () => {
        native.exportDatabase = original;
      },
    };
    (globalThis as PausedMain).__cruxGardenBackupPause = state;
    native.exportDatabase = async function () {
      state.restore();
      state.held = true;
      await new Promise<void>((resolve) => {
        state.resume = resolve;
      });
      return original.call(this);
    };
  });
}

async function resumeExport(app: ElectronApplication) {
  await app.evaluate(() => {
    const state = (globalThis as PausedMain).__cruxGardenBackupPause;
    state?.restore();
    state?.resume?.();
    delete (globalThis as PausedMain).__cruxGardenBackupPause;
  });
}

/** Hold archive intake before native inspection takes a database lock. Exports
 * inspect without an inventory and must continue normally while this is held. */
async function pauseImportInspection(app: ElectronApplication) {
  await app.evaluate(({ app }) => {
    const path = process.getBuiltinModule('path');
    const load = process
      .getBuiltinModule('module')
      .createRequire(path.join(app.getAppPath(), 'package.json'));
    const { SqliteApi } = load('./dist/sqlite-api.js') as typeof import('../src/sqlite-api');
    const native = SqliteApi.prototype;
    const original = native.inspectImport;
    const state: ExportPause = {
      held: false,
      restore: () => {
        native.inspectImport = original;
      },
    };
    (globalThis as PausedMain).__cruxGardenImportPause = state;
    native.inspectImport = async function (data, availableFingerprints) {
      if (availableFingerprints !== undefined) {
        state.restore();
        state.held = true;
        await new Promise<void>((resolve) => {
          state.resume = resolve;
        });
      }
      return original.call(this, data, availableFingerprints);
    };
  });
}

async function resumeImportInspection(app: ElectronApplication) {
  await app.evaluate(() => {
    const state = (globalThis as PausedMain).__cruxGardenImportPause;
    state?.restore();
    state?.resume?.();
    delete (globalThis as PausedMain).__cruxGardenImportPause;
  });
}

test('Garden backup: switching account during native export sends no private bytes; explicit retry succeeds', async () => {
  const testInfo = test.info();
  test.setTimeout(150_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('Garden push failed:'))
      failures.push(message.text());
  });
  try {
    await enterGarden(page);
    await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Account');
    const account = page.getByTestId('account-settings');
    await connectAccount(page, account);
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();

    const id = await createCrux(page, 'Retained Garden backup source');
    const source = '<h1>Private Garden work stays here</h1>';
    const editor = await writeFirstFile(page, 'index.html', source);
    const folder = (await storedCrux(page, id)).projectFolder;
    await expect.poll(() => readFileSync(join(folder, 'index.html'), 'utf8')).toBe(source);
    const fingerprint = await storedFingerprint(page, id, 'index.html');
    expect(fingerprint).toBeTruthy();

    const settings = await showPane(page, 'Settings');
    const openSync = async () => {
      await chooseSettingsSection(page, 'Garden and backups');
      const expand = settings.getByRole('button', { name: 'Sync', exact: true });
      if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click();
      return settings.getByRole('region', { name: 'Sync', exact: true });
    };
    let sync = await openSync();
    await expect(
      sync.getByRole('switch', { name: 'Automatic backup', exact: true }),
    ).not.toBeChecked();
    await pauseExport(app);
    await sync.getByRole('button', { name: 'Push garden', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as PausedMain).__cruxGardenBackupPause?.held ?? false),
      )
      .toBe(true);
    await expect(sync.getByRole('status')).toContainText('Exporting database...');

    await chooseSettingsSection(page, 'Account');
    await account.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(settings.getByRole('region', { name: 'Sync', exact: true })).toHaveCount(0);
    await account.getByPlaceholder('email@example.com').fill('other@example.com');
    await account.getByRole('button', { name: 'Send Code' }).click();
    await account.getByPlaceholder('Enter code').fill('123456');
    await account.getByRole('button', { name: 'Connect', exact: true }).click();
    await page
      .getByRole('dialog')
      .filter({ hasText: 'A different account' })
      .getByRole('button', { name: 'Switch this garden', exact: true })
      .click();
    await expect(account.getByText(/Connected —/)).toContainText('other@example.com');
    await resumeExport(app);

    // The old Settings instance is gone. Its completed failure is diagnostic evidence,
    // while the new account must show neither its progress nor a success from that push.
    await expect
      .poll(() => failures.some((message) => message.includes('account connection changed')))
      .toBe(true);
    sync = await openSync();
    await expect(sync.getByRole('button', { name: 'Push garden', exact: true })).toBeEnabled();
    await expect(sync.getByRole('status')).toHaveCount(0);
    await expect(sync.getByText(/^Last pushed:/)).toHaveCount(0);
    expect(api.log.filter((line) => line.startsWith('PUT /sync/garden '))).toEqual([]);
    expect(api.state.sync.garden).toBeNull();
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(source);
    expect(await storedFingerprint(page, id, 'index.html')).toBe(fingerprint);
    await expect(editor).toContainText('Private Garden work stays here');
    await page.screenshot({ path: testInfo.outputPath('garden-backup-account-refusal.png') });

    await sync.getByRole('button', { name: 'Push garden', exact: true }).click();
    await expect(sync.getByRole('status')).toHaveText('Garden pushed successfully', {
      timeout: 60_000,
    });
    await expect(sync.getByText(/^Last pushed:/)).toBeVisible();
    expect(api.state.loginEmail).toBe('other@example.com');
    expect(api.log.filter((line) => line.startsWith('PUT /sync/garden '))).toHaveLength(1);
    const uploaded = api.state.sync.garden?.data;
    expect(uploaded?.length).toBeGreaterThan(0);
    const archive = await JSZip.loadAsync(uploaded!);
    expect(JSON.parse(await archive.file('manifest.json')!.async('string')).scope).toBe(
      'installation',
    );
    expect(await archive.file(`artifacts/${fingerprint}`)!.async('string')).toBe(source);
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(source);
    expect(await storedFingerprint(page, id, 'index.html')).toBe(fingerprint);
  } finally {
    await resumeExport(app);
    await app.close();
    await api.close();
  }
});

test('Garden pull: account switch during native import preparation preserves newer work; fresh restore succeeds', async () => {
  test.setTimeout(210_000);
  const testInfo = test.info();
  const api = await startMockApi();
  const { app, page } = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('Garden pull failed:'))
      failures.push(message.text());
  });
  try {
    await enterGarden(page);
    const title = 'Retained Garden restore source';
    const id = await createCrux(page, title);
    const backedUp = '<h1>Version kept in the cloud backup</h1>';
    const newer = '<h1>Newer local work must survive account changes</h1>';
    const editor = await writeFirstFile(page, 'index.html', backedUp);
    const folder = (await storedCrux(page, id)).projectFolder as string;
    await expect.poll(() => readFileSync(join(folder, 'index.html'), 'utf8')).toBe(backedUp);
    const backupFingerprint = await storedFingerprint(page, id, 'index.html');
    expect(backupFingerprint).toBeTruthy();

    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Account');
    const account = settings.getByTestId('account-settings');
    await connectAccount(page, account);
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    const openSync = async () => {
      await chooseSettingsSection(page, 'Garden and backups');
      const expand = settings.getByRole('button', { name: 'Sync', exact: true });
      if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click();
      return settings.getByRole('region', { name: 'Sync', exact: true });
    };
    let sync = await openSync();
    await expect(
      sync.getByRole('switch', { name: 'Automatic backup', exact: true }),
    ).not.toBeChecked();
    await sync.getByRole('button', { name: 'Push garden', exact: true }).click();
    await expect(sync.getByRole('status')).toHaveText('Garden pushed successfully', {
      timeout: 60_000,
    });
    const backup = api.state.sync.garden!;
    expect(backup.data?.length).toBeGreaterThan(0);
    const archive = await JSZip.loadAsync(backup.data!);
    expect(await archive.file(`artifacts/${backupFingerprint}`)!.async('string')).toBe(backedUp);
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();

    // The existing drift warning allows five seconds of clock skew. Let actual
    // time pass before making the newer edit, preserving that user-facing check.
    await expect
      .poll(() => Date.now() - Date.parse(backup.syncedAt), { timeout: 10_000 })
      .toBeGreaterThan(5_000);
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(newer);
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFileSync(join(folder, 'index.html'), 'utf8')).toBe(newer);
    const newerFingerprint = await storedFingerprint(page, id, 'index.html');
    expect(newerFingerprint).not.toBe(backupFingerprint);
    await showPane(page, 'Settings');
    sync = await openSync();

    const confirmPull = async () => {
      await sync.getByRole('button', { name: 'Pull garden', exact: true }).click();
      const drift = page.getByRole('dialog', { name: 'Newer work on this machine', exact: true });
      await expect(drift).toContainText(title);
      await drift.getByRole('button', { name: 'Pull anyway', exact: true }).click();
      const backupOffer = page
        .getByRole('dialog')
        .filter({ hasText: 'export your current garden first' });
      await expect(backupOffer).toBeVisible();
      await backupOffer.getByRole('button', { name: 'Cancel', exact: true }).click();
      const final = page.getByRole('dialog').filter({ hasText: 'replace your entire garden' });
      await final.getByRole('button', { name: 'Continue', exact: true }).click();
    };
    await pauseImportInspection(app);
    await confirmPull();
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as PausedMain).__cruxGardenImportPause?.held ?? false),
      )
      .toBe(true);
    await expect(sync.getByRole('status')).toHaveText('Checking required content...');

    const switchAccount = async (email: string) => {
      await chooseSettingsSection(page, 'Account');
      await account.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await account.getByPlaceholder('email@example.com').fill(email);
      await account.getByRole('button', { name: 'Send Code' }).click();
      await account.getByPlaceholder('Enter code').fill('123456');
      await account.getByRole('button', { name: 'Connect', exact: true }).click();
      await page
        .getByRole('dialog')
        .filter({ hasText: 'A different account' })
        .getByRole('button', { name: 'Switch this garden', exact: true })
        .click();
      await expect(account.getByText(/Connected —/)).toContainText(email);
    };
    await switchAccount('other@example.com');
    await resumeImportInspection(app);
    await expect
      .poll(() => failures.some((message) => message.includes('account connection changed')))
      .toBe(true);
    expect((await storedCrux(page, id)).projectFolder).toBe(folder);
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(newer);
    expect(await storedFingerprint(page, id, 'index.html')).toBe(newerFingerprint);
    expect(api.state.sync.garden?.data).toEqual(backup.data);
    sync = await openSync();
    await expect(sync.getByRole('button', { name: 'Pull garden', exact: true })).toBeEnabled();
    await expect(sync.getByRole('status')).toHaveCount(0);
    await expect(editor).toContainText('Newer local work must survive account changes');
    await page.screenshot({ path: testInfo.outputPath('garden-pull-account-refusal.png') });

    // Returning to the archive's account does not bypass the workspace guard.
    // Even a newly authorized pull must preserve an open workspace's newer work.
    await switchAccount('tester@example.com');
    sync = await openSync();
    await confirmPull();
    await expect(sync.getByRole('alert')).toHaveText(
      'Close all open Crux workspaces before replacing this garden.',
    );
    await expect(sync.getByRole('button', { name: 'Pull garden', exact: true })).toBeEnabled();
    await expect(sync.getByRole('status')).toHaveCount(0);
    expect((await storedCrux(page, id)).projectFolder).toBe(folder);
    expect(await storedFingerprint(page, id, 'index.html')).toBe(newerFingerprint);
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(newer);
    expect(api.state.sync.garden?.data).toEqual(backup.data);
    await expect(editor).toContainText('Newer local work must survive account changes');

    // Save and close the only open workspace through the ordinary UI. A fresh
    // confirmation from Home can now replace the Garden without stale sessions.
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await closeWorkspace(page, title);
    await expect(page.getByTestId('pane-body-home')).toBeVisible();
    await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
    await showPane(page, 'Settings');
    sync = await openSync();
    const reloaded = page.waitForEvent('load', { timeout: 90_000 });
    await confirmPull();
    await reloaded;
    await expect.poll(() => storedFingerprint(page, id, 'index.html')).toBe(backupFingerprint);
    const restoredFolder = (await storedCrux(page, id)).projectFolder as string;
    expect(restoredFolder).not.toBe(folder);
    expect(readFileSync(join(restoredFolder, 'index.html'), 'utf8')).toBe(backedUp);
    // The explicit successful restore allocates fresh folders; newer bytes are
    // still available in the original folder even after choosing the older copy.
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(newer);
  } finally {
    await resumeImportInspection(app);
    await app.close();
    await api.close();
  }
});
