import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { createCrux, enterGarden, storedCrux, storedFingerprint } from './multi-crux-helpers';
import { chooseSettingsSection, openPanel, showPane } from './panel-helpers';
import { connectAccount, writeFirstFile } from './journeys/journey-helpers';

type PreparationPause = {
  held: boolean;
  resume?: () => void;
  restore: () => void;
};
type PausedMain = typeof globalThis & { __cruxConnectionPause?: PreparationPause };

/** Hold one real native operation before it acquires the database, then run it unchanged. */
async function pausePreparation(
  app: ElectronApplication,
  cruxId: string,
  operation: 'publication' | 'backup' | 'pull review',
) {
  await app.evaluate(
    ({ app }, { cruxId, operation }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const native = LocalGraphRuntime.prototype;
      const originalRead = native.readFileContent;
      const originalExport = native.exportPrivateGraph;
      const originalHead = native.fileContentHead;
      const state: PreparationPause = {
        held: false,
        restore: () => {
          native.readFileContent = originalRead;
          native.exportPrivateGraph = originalExport;
          native.fileContentHead = originalHead;
        },
      };
      (globalThis as PausedMain).__cruxConnectionPause = state;
      const hold = async () => {
        state.restore();
        state.held = true;
        await new Promise<void>((resolve) => {
          state.resume = resolve;
        });
      };
      if (operation === 'publication') {
        native.readFileContent = async function (input, store) {
          if (input.cruxId === cruxId && input.path === 'index.html') await hold();
          return originalRead.call(this, input, store);
        };
      } else if (operation === 'backup') {
        native.exportPrivateGraph = async function (selection, store) {
          if (selection.roots.includes(cruxId)) await hold();
          return originalExport.call(this, selection, store);
        };
      } else {
        // A background refresh may read this owner's head before Pull does.
        // Keep every read behind one gate until the test explicitly resumes,
        // so that refresh cannot consume the intended preparation pause.
        const reviewGate = new Promise<void>((resolve) => {
          state.resume = resolve;
        });
        native.fileContentHead = async function (id) {
          if (id === cruxId) {
            state.held = true;
            await reviewGate;
          }
          return originalHead.call(this, id);
        };
      }
    },
    { cruxId, operation },
  );
}

async function resumePreparation(app: ElectronApplication) {
  await app.evaluate(() => {
    const state = (globalThis as PausedMain).__cruxConnectionPause;
    state?.restore();
    state?.resume?.();
    delete (globalThis as PausedMain).__cruxConnectionPause;
  });
}

async function switchAccount(page: Page) {
  await showPane(page, 'Settings');
  await chooseSettingsSection(page, 'Account');
  const account = page.getByTestId('account-settings');
  await account.getByRole('button', { name: 'Disconnect', exact: true }).click();
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
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
}

for (const operation of ['publication', 'backup'] as const) {
  test(`${operation}: switching account during local preparation sends no private bytes; explicit retry succeeds`, async ({}, testInfo) => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await showPane(page, 'Settings');
      await chooseSettingsSection(page, 'Account');
      const account = page.getByTestId('account-settings');
      await connectAccount(page, account);
      await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
      await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
      const id = await createCrux(page, `Retained ${operation}`);
      const source = '<h1>Local work stays here</h1>';
      const editor = await writeFirstFile(page, 'index.html', source);
      const folder = (await storedCrux(page, id)).projectFolder;
      await expect.poll(() => readFileSync(join(folder, 'index.html'), 'utf8')).toBe(source);
      const fingerprint = await storedFingerprint(page, id, 'index.html');
      expect(fingerprint).toBeTruthy();
      const pane = await openPanel(
        page,
        operation === 'publication' ? 'publish' : 'sync',
        operation === 'publication' ? 'Toggle share' : 'Toggle sync',
      );
      await pausePreparation(app, id, operation);
      const backupChoice = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      if (operation === 'publication') {
        await pane.getByRole('button', { name: 'Share', exact: true }).click();
        await backupChoice.getByRole('button', { name: 'Share without a backup' }).click();
      } else {
        await pane.getByRole('button', { name: 'Push to cloud', exact: true }).click();
      }
      await expect
        .poll(() =>
          app.evaluate(() => (globalThis as PausedMain).__cruxConnectionPause?.held ?? false),
        )
        .toBe(true);
      await switchAccount(page);
      await resumePreparation(app);

      if (operation === 'publication') {
        await expect(pane.getByRole('alert')).toContainText('account connection changed');
      } else {
        await expect(
          pane.getByText('The account connection changed. Please try again.', { exact: true }),
        ).toBeVisible();
      }
      expect(
        api.log.filter((line) => /^(POST|PUT|PATCH|DELETE) \/(?:cruxes|sync)(?:\/| )/.test(line)),
      ).toEqual([]);
      expect(api.state.published[id]).toBeUndefined();
      expect(api.state.sync.cruxes[id]).toBeUndefined();
      expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(source);
      expect(await storedFingerprint(page, id, 'index.html')).toBe(fingerprint);
      await expect(editor).toContainText('Local work stays here');
      await page.screenshot({ path: testInfo.outputPath(`${operation}-account-refusal.png`) });

      if (operation === 'publication') {
        await pane
          .getByRole('button', { name: /Retry|Share/, exact: false })
          .first()
          .click();
        if (await backupChoice.isVisible())
          await backupChoice.getByRole('button', { name: 'Share without a backup' }).click();
        await expect(pane.getByText('Up to date', { exact: true })).toBeVisible();
        expect(
          api.state.published[id].find((file) => file.path === 'index.html')?.bytes.toString(),
        ).toBe(source);
        expect(
          api.log.filter((line) => line.startsWith(`POST /cruxes/${id}/publish `)),
        ).toHaveLength(1);
      } else {
        await pane.getByRole('button', { name: 'Push to cloud', exact: true }).click();
        await expect(pane.getByText(/Synced .+/)).toBeVisible({ timeout: 60_000 });
        expect(api.state.sync.cruxes[id].data?.length).toBeGreaterThan(0);
        expect(api.log.filter((line) => line.startsWith(`PUT /sync/crux/${id} `))).toHaveLength(1);
      }
      expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(source);
    } finally {
      await resumePreparation(app);
      await app.close();
      await api.close();
    }
  });
}

test('Sync: a second account with an unavailable listing never displays the previous backup or storage budget', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Account backup inventory');
    await writeFirstFile(page, 'index.html', '<h1>Keep this work</h1>');
    const sync = await openPanel(page, 'sync', 'Toggle sync');
    api.state.sync.cruxes[id] = {
      bytes: 1024,
      slug: 'first',
      title: 'First account',
      updatedAt: '2026-09-29T12:00:00Z',
    };
    api.state.storageUsedBytes = 1_000_000_000_000;
    await connectAccount(page, sync);
    await expect(sync.getByText(/^Synced /)).toBeVisible();
    const previousDate = await sync.getByText(/^Synced /).innerText();
    await expect(sync.getByTestId('sync-budget')).toBeVisible();

    api.state.failSyncCruxList = true;
    api.state.sync.cruxes = {};
    api.state.storageUsedBytes = 0;
    await switchAccount(page);
    await expect(sync.getByRole('alert')).toContainText('Could not load cloud backup');
    await expect(sync.getByText(/^Synced /)).toHaveCount(0);
    await expect(sync.getByTestId('sync-budget')).toHaveCount(0);
    await expect(sync.getByText(/^Not synced yet/)).toHaveCount(0);
    await expect(sync.getByRole('button', { name: 'Pull from cloud', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('sync-account-list-refusal.png') });

    api.state.failSyncCruxList = false;
    api.state.sync.cruxes[id] = {
      bytes: 2048,
      slug: 'second',
      title: 'Second account',
      updatedAt: '2026-10-02T12:00:00Z',
    };
    await sync.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(sync.getByRole('alert')).toHaveCount(0);
    await expect(sync.getByText(/^Synced /)).toBeVisible();
    await expect(sync.getByText(/^Synced /)).not.toHaveText(previousDate);
    await expect(sync.getByRole('button', { name: 'Pull from cloud', exact: true })).toBeEnabled();
  } finally {
    await app.close();
    await api.close();
  }
});

test('Sync: account changes during pull review preserve newer local work; a fresh confirmed pull succeeds', async () => {
  test.setTimeout(150_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Pull account review');
    const cloud = '<h1>Cloud edition</h1>';
    const local = '<h1>Newer local work</h1>';
    const editor = await writeFirstFile(page, 'index.html', cloud);
    const folder = (await storedCrux(page, id)).projectFolder;
    const sync = await openPanel(page, 'sync', 'Toggle sync');
    await connectAccount(page, sync);
    await sync.getByRole('button', { name: 'Push to cloud', exact: true }).click();
    await expect(sync.getByText(/^Synced /)).toBeVisible({ timeout: 60_000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(local);
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFileSync(join(folder, 'index.html'), 'utf8')).toBe(local);
    const requestsBeforeReview = api.log.length;
    await pausePreparation(app, id, 'pull review');
    await sync.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as PausedMain).__cruxConnectionPause?.held ?? false),
      )
      .toBe(true);
    await switchAccount(page);
    await resumePreparation(app);
    await expect(
      sync.getByText('The account connection changed. Please try again.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Pull from cloud', exact: true })).toHaveCount(0);
    expect(
      api.log
        .slice(requestsBeforeReview)
        .filter((line) => line.startsWith(`GET /sync/crux/${id} `)),
    ).toEqual([]);
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(local);
    await expect(editor).toContainText('Newer local work');

    await sync.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Pull from cloud', exact: true })
      .getByRole('button', { name: 'Pull anyway', exact: true })
      .click();
    await expect(
      page.getByTestId('pane-body-sync').getByText('Pull complete', { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    const restoredFolder = (await storedCrux(page, id)).projectFolder;
    expect(readFileSync(join(restoredFolder, 'index.html'), 'utf8')).toBe(cloud);
    expect(
      api.log
        .slice(requestsBeforeReview)
        .filter((line) => line.startsWith(`GET /sync/crux/${id} `)),
    ).toHaveLength(1);
  } finally {
    await resumePreparation(app);
    await app.close();
    await api.close();
  }
});
