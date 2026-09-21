import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux, addArtifact, switchCrux } from './multi-crux-helpers';

test('pulling one Crux preserves another open workspace and its unsent draft', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Cloud study');
    await addArtifact(page, 'study.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Cloud copy');
    await expect(page.locator('.monaco-editor')).toContainText('Cloud copy');
    await page.keyboard.press('ControlOrMeta+s');
    await page.getByRole('button', { name: 'Toggle sync' }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: 'Push to cloud', exact: true }).click();
    await expect(page.getByText('Pushed successfully')).toBeVisible();
    const archive = await JSZip.loadAsync(api.state.sync.cruxes[cruxId]!.data!);
    const version = JSON.parse(await archive.file('versions/current.json')!.async('text'));
    expect(
      await archive.file('artifacts/' + version.artifacts['study.txt'].fingerprint)!.async('text'),
    ).toBe('Cloud copy');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Local changes to replace');
    await expect(page.locator('.monaco-editor')).toContainText('Local changes to replace');
    await createCrux(page, 'Unfinished thought');
    await page.getByPlaceholder('Send a message...').fill('Keep this unsent thought');
    await switchCrux(page, 'Cloud study');
    await page.evaluate(() => {
      document.documentElement.dataset.syncProbe = 'same document';
    });
    await page.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Pull from cloud' });
    await ask.getByRole('button', { name: /^Pull(?: anyway)?$/, exact: true }).click();
    await expect(page.getByText(/Pull complete/)).toBeVisible();
    // The old path schedules a full reload 800 ms after this success message.
    await page.waitForTimeout(1500);
    await expect(page.locator('html')).toHaveAttribute('data-sync-probe', 'same document');
    const diskMeta = (await page.evaluate(
      async (id) => window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [id]),
      cruxId,
    )) as { meta: string };
    expect(readFileSync(join(JSON.parse(diskMeta.meta).projectFolder, 'study.txt'), 'utf8')).toBe(
      'Cloud copy',
    );
    await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('Cloud copy');
    await expect(page.locator('.monaco-editor .view-lines').first()).not.toContainText(
      'Local changes',
    );
    await switchCrux(page, 'Unfinished thought');
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue(
      'Keep this unsent thought',
    );
  } finally {
    await app.close();
    await api.close();
  }
});

test('cloud pull replaces a complete Task graph and reopens independent Main and Task files', async () => {
  test.setTimeout(120_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const mainId = await createCrux(page, 'Task cloud study');
    await addArtifact(page, 'study.txt');
    const showArtifacts = async () => {
      if (!(await page.getByTestId('pane-body-artifacts').isVisible()))
        await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    };
    const edit = async (text: string) => {
      await showArtifacts();
      await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
      await page.locator('.monaco-editor').click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(text);
      await page.keyboard.press('ControlOrMeta+s');
      await expect(page.locator('.monaco-editor')).toContainText(text);
    };
    await edit('Main cloud copy');
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Alternative');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const taskId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await edit('Task cloud copy');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle sync' }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: 'Push to cloud', exact: true }).click();
    await expect(page.getByText('Pushed successfully')).toBeVisible();
    const archive = await JSZip.loadAsync(api.state.sync.cruxes[mainId]!.data!);
    expect(archive.file('tasks.json')).not.toBeNull();
    await edit('Local Main to replace');
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /^Alternative/ })
      .click();
    await edit('Local Task to replace');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    await page.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Pull from cloud' })
      .getByRole('button', { name: /^Pull(?: anyway)?$/, exact: true })
      .click();
    await expect(page.getByText('Pull complete')).toBeVisible();
    await showArtifacts();
    await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
    await expect(page.locator('.monaco-editor')).toContainText('Main cloud copy');
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /^Alternative/ })
      .click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    await showArtifacts();
    await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
    await expect(page.locator('.monaco-editor')).toContainText('Task cloud copy');
    const paths = await page.evaluate(
      async ({ mainId, taskId }) => {
        const main = (await window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [
          mainId,
        ])) as { meta: string };
        const task = (await window.electronAPI!.sqlite.get(
          'SELECT project_folder FROM working_copies WHERE id = ?',
          [taskId],
        )) as { project_folder: string };
        return { main: JSON.parse(main.meta).projectFolder, task: task.project_folder };
      },
      { mainId, taskId },
    );
    expect(paths.main).not.toBe(paths.task);
    expect(readFileSync(join(paths.main, 'study.txt'), 'utf8')).toBe('Main cloud copy');
    expect(readFileSync(join(paths.task, 'study.txt'), 'utf8')).toBe('Task cloud copy');
  } finally {
    await app.close();
    await api.close();
  }
});
