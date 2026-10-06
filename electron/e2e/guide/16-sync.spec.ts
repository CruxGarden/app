import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel, newTaskButton } from '../panel-helpers';
import { connectAccount, markVersion, writeFirstFile } from '../journeys/journey-helpers';

/** Open `name` from Artifacts and replace its text. */
async function editFile(page: Page, name: string, text: string) {
  await openPanel(page, 'artifacts', 'Toggle artifacts');
  await page.getByRole('tree').getByText(name, { exact: true }).click();
  const monaco = page.locator('.monaco-editor').first();
  await expect(monaco).toBeVisible({ timeout: 30_000 });
  await monaco.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(monaco).toContainText(text);
  return monaco;
}

/** Start a Task from the bar and land in its workspace; returns the Task's workspace id. */
async function startTask(page: Page, name: string) {
  await (await newTaskButton(page)).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}

const taskBar = (page: Page) => page.getByTestId('task-bar');
const toMain = (page: Page) =>
  taskBar(page).getByRole('link', { name: 'Main', exact: true }).click();
const toTask = (page: Page, name: string) =>
  taskBar(page)
    .getByRole('link', { name: new RegExp(`^${name}`) })
    .click();

/** Connect from Settings → Account (the Home has no Sync pane). */
async function connectFromSettings(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await connectAccount(page);
  await expect(page.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
}

const taskFolder = (page: Page, id: string) =>
  page.evaluate(
    async (id) =>
      (
        (await window.electronAPI!.sqlite.get(
          'SELECT project_folder FROM working_copies WHERE id = ?',
          [id],
        )) as { project_folder: string }
      ).project_folder,
    id,
  );

/**
 * V1-TESTING-GUIDE § 16 · Sync — the pane's states: not synced, synced with
 * a time and size, changed here since. Recovery and drift are sync-* specs.
 */
test.describe('guide 16 · Sync', () => {
  test('SYNC-02 — a backed-up Crux restored on a second profile from the account list arrives with its history, its Task, a real folder and a preview', async () => {
    test.setTimeout(300_000);
    const api = await startMockApi();
    // ── Profile A: a Crux with a marked version and a Task, pushed ──
    const a = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      const { page } = a;
      await enterGarden(page);
      await createCrux(page, 'Carried');
      await writeFirstFile(page, 'index.html', '<h1>Carried</h1>');
      await markVersion(page, 'First words');
      await startTask(page, 'Alternative');
      await editFile(page, 'index.html', '<h1>Task edition</h1>');
      await toMain(page);
      const sync = await openPanel(page, 'sync', 'Toggle sync');
      await connectAccount(page, sync);
      await sync.getByRole('button', { name: 'Push to cloud' }).click();
      await expect(sync.getByText(/Synced .+/)).toBeVisible({ timeout: 60_000 });
      expect(Object.keys(api.state.sync.cruxes)).toHaveLength(1);
    } finally {
      await a.app.close();
    }
    // ── Profile B: a fresh garden, the same account ──
    const b = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      const { page } = b;
      await enterGarden(page);
      await expect(page.getByTestId('recover-section')).toHaveCount(0);
      await connectFromSettings(page);
      await page.keyboard.press('Escape');
      const recover = page.getByTestId('recover-section');
      await expect(recover).toBeVisible({ timeout: 30_000 });
      const row = recover.locator('li').filter({ hasText: 'Carried' });
      await expect(row).toContainText('Backup');
      await row.getByRole('button', { name: 'Restore' }).click();
      await expect(recover).toHaveCount(0, { timeout: 60_000 });
      expect(api.state.sync.down).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Open Carried' }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      // A real Project Folder on this machine with the file in it.
      const folder = (await storedCrux(page, id)).projectFolder as string;
      expect(folder).toContain(b.dir);
      await expect
        .poll(() => existsSync(join(folder, 'index.html')), { timeout: 30_000 })
        .toBe(true);
      expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe('<h1>Carried</h1>');
      // The history and its label came along.
      const history = await openPanel(page, 'history', 'Toggle growth');
      await expect(history.getByText('First words', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      // The preview shows the page.
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('index.html', { exact: true }).click();
      const workshop = page.getByTestId('pane-body-workshop');
      const previewButton = workshop.getByRole('button', { name: 'Preview', exact: true });
      if (await previewButton.isVisible().catch(() => false)) await previewButton.click();
      await expect(
        page.frameLocator('iframe[data-crux-id]').getByRole('heading', { name: 'Carried' }),
      ).toBeVisible({ timeout: 30_000 });
      // The Task is there with its own edition in its own folder.
      await expect(taskBar(page).getByRole('link', { name: /^Alternative/ })).toBeVisible();
      await toTask(page, 'Alternative');
      await expect(page.locator('[data-workspace-id]')).not.toHaveAttribute(
        'data-workspace-id',
        id,
        {
          timeout: 30_000,
        },
      );
      const taskId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('index.html', { exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Task edition', {
        timeout: 30_000,
      });
      const tFolder = await taskFolder(page, taskId);
      expect(tFolder).not.toBe(folder);
      // (Monaco may auto-close the tag: compare what was typed, not the trailing bracket.)
      expect(readFileSync(join(tFolder, 'index.html'), 'utf8')).toContain('<h1>Task edition</h1>');
    } finally {
      await b.app.close();
      await api.close();
    }
  });

  test('SYNC-05 — a pull replaces Main and its Task separately; an edit made outside right after is picked up in Main alone', async () => {
    test.setTimeout(240_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const mainId = await createCrux(page, 'Task cloud study');
      await writeFirstFile(page, 'study.txt', 'Main cloud copy');
      const taskId = await startTask(page, 'Alternative');
      await editFile(page, 'study.txt', 'Task cloud copy');
      await toMain(page);
      const sync = await openPanel(page, 'sync', 'Toggle sync');
      await connectAccount(page, sync);
      await sync.getByRole('button', { name: 'Push to cloud' }).click();
      await expect(sync.getByText(/Synced .+/)).toBeVisible({ timeout: 60_000 });
      // Both move on locally; the pull puts the cloud copies back, each in its place.
      await editFile(page, 'study.txt', 'Local Main to replace');
      await toTask(page, 'Alternative');
      await editFile(page, 'study.txt', 'Local Task to replace');
      await toMain(page);
      await page.waitForTimeout(2000);
      await sync.getByRole('button', { name: 'Pull from cloud' }).click();
      await page
        .getByRole('dialog', { name: 'Pull from cloud' })
        .getByRole('button', { name: /^Pull(?: anyway)?$/, exact: true })
        .click();
      // (The note is a truncated line the layout may clip; its presence is the signal.)
      await expect(sync.getByText('Pull complete')).toHaveCount(1, { timeout: 90_000 });
      const mainFolder = (await storedCrux(page, mainId)).projectFolder as string;
      await expect
        .poll(() => readFileSync(join(mainFolder, 'study.txt'), 'utf8'), { timeout: 30_000 })
        .toBe('Main cloud copy');
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
      const editor = page.locator('.monaco-editor').first();
      await expect(editor).toContainText('Main cloud copy', { timeout: 30_000 });
      await toTask(page, 'Alternative');
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        taskId,
      );
      const tFolder = await taskFolder(page, taskId);
      expect(tFolder).not.toBe(mainFolder);
      await expect
        .poll(() => readFileSync(join(tFolder, 'study.txt'), 'utf8'), { timeout: 30_000 })
        .toBe('Task cloud copy');
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Task cloud copy', {
        timeout: 30_000,
      });
      // Straight after the pull, an outside editor writes into Main's folder: the
      // restored folder is watched, the Task's copy is not touched.
      await toMain(page);
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
      writeFileSync(join(mainFolder, 'study.txt'), 'Edited outside after the pull');
      await expect(page.locator('.monaco-editor').first()).toContainText(
        'Edited outside after the pull',
        { timeout: 30_000 },
      );
      expect(readFileSync(join(tFolder, 'study.txt'), 'utf8')).toBe('Task cloud copy');
      await toTask(page, 'Alternative');
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Task cloud copy', {
        timeout: 30_000,
      });
      await expect(page.locator('.monaco-editor').first()).not.toContainText('Edited outside');
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SYNC-06 — automatic backup says when it runs, backs up a quiet Crux, and is still on after a restart', async () => {
    test.setTimeout(300_000);
    const api = await startMockApi();
    const env = { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1', CRUX_AUTOBACKUP_QUIET_MS: '400' };
    const first = await launchApp({ env });
    const pushes = () => api.log.filter((l) => l.startsWith('PUT /sync/crux/')).length;
    try {
      const { page } = first;
      await enterGarden(page);
      await connectFromSettings(page);
      await page.locator('h2', { hasText: /^Sync$/ }).click();
      const auto = page.getByTestId('auto-backup');
      // The setting says what triggers a backup before it is switched on.
      await expect(auto).toContainText('ten minutes after it goes quiet');
      await expect(auto.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      await auto.getByRole('switch').click();
      await expect(auto.getByTestId('auto-backup-status')).toContainText(
        'On — the first garden backup runs shortly',
      );
      await page.keyboard.press('Escape');
      // A Crux the mock collaborator writes into: the auto-snapshot, then the quiet push.
      await createCrux(page, 'Quiet one');
      const composer = page.getByPlaceholder('Send a message...');
      await expect(composer).toBeVisible({ timeout: 30_000 });
      await composer.fill('write hello.md saying hi');
      await composer.press('Enter');
      await expect.poll(pushes, { timeout: 90_000 }).toBeGreaterThan(0);
      const sync = await openPanel(page, 'sync', 'Toggle sync');
      await expect(sync.getByTestId('sync-auto-note')).toContainText('Automatic backup is on');
      await expect(sync.getByText(/Synced .+/)).toBeVisible({ timeout: 30_000 });
    } finally {
      await first.app.close();
    }
    const before = pushes();
    // ── Restart on the same profile: the setting held, and it still works ──
    const again = await launchApp({ dir: first.dir, env });
    try {
      const { page } = again;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await expect(page.locator('[data-testid^="pane-body-"]').first()).toBeVisible({
        timeout: 30_000,
      });
      // The remembered workspace may come back open: reach Settings from the account menu.
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      const settings = page.getByTestId('pane-body-settings');
      await expect(settings).toBeVisible({ timeout: 30_000 });
      await settings.locator('h2', { hasText: /^Sync$/ }).click();
      const auto = page.getByTestId('auto-backup');
      await expect(auto.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      await expect(auto.getByTestId('auto-backup-status')).toBeVisible();
      await expect(auto.getByTestId('auto-backup-paused')).toHaveCount(0);
      await page.keyboard.press('Escape');
      if (!(await page.locator('[data-workspace-id]').count()))
        await page.getByRole('button', { name: 'Open Quiet one' }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Quiet one',
      );
      const sync = await openPanel(page, 'sync', 'Toggle sync');
      await expect(sync.getByTestId('sync-auto-note')).toContainText('Automatic backup is on', {
        timeout: 30_000,
      });
      // A new change and a marked version: the quiet timer pushes again after the restart.
      // (The Crux already has a file, so the file comes from Artifacts → New file.)
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('more.md');
      await nameInput.press('Enter');
      const more = page.locator('.monaco-editor').first();
      await expect(more).toBeVisible({ timeout: 30_000 });
      await more.click();
      await page.keyboard.type('more');
      await page.keyboard.press('ControlOrMeta+s');
      await markVersion(page, 'After restart');
      await expect.poll(pushes, { timeout: 90_000 }).toBeGreaterThan(before);
      await expect(sync.getByTestId('sync-auto-note')).toContainText('Automatic backup is on');
      await expect(sync.getByTestId('sync-auto-note')).not.toContainText('paused');
    } finally {
      await again.app.close();
      await api.close();
    }
  });

  test('SYNC-01 — not synced → synced with a time and size → changed here after the last push', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Backed up');
      const monaco = await writeFirstFile(page, 'index.html', '<h1>One</h1>');
      const sync = await openPanel(page, 'sync', 'Toggle sync');
      await connectAccount(page, sync);
      await expect(sync.getByText('Not synced yet')).toBeVisible({ timeout: 30_000 });
      await sync.getByRole('button', { name: 'Push to cloud' }).click();
      await expect(sync.getByText(/Synced .+/)).toBeVisible({ timeout: 60_000 });
      await expect(sync.getByText(/\d+(\.\d+)? (B|KB|MB)/).first()).toBeVisible();
      expect(Object.keys(api.state.sync.cruxes)).toHaveLength(1);
      // An edit after the push: Pull warns that this copy moved on.
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('<h1>Two</h1>');
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(3000);
      await sync.getByRole('button', { name: 'Pull from cloud' }).click();
      const ask = page.getByRole('dialog', { name: 'Pull from cloud' });
      await expect(ask).toContainText(/changed here after its last push/);
      await ask.getByRole('button', { name: 'Cancel' }).click();
      // Pushing again keeps one record, newer.
      const before = api.state.sync.up;
      await sync.getByRole('button', { name: 'Push to cloud' }).click();
      await expect.poll(() => api.state.sync.up, { timeout: 60_000 }).toBeGreaterThan(before);
      expect(Object.keys(api.state.sync.cruxes)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
