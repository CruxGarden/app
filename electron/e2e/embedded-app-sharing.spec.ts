import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';

/**
 * Share selected content against the actual apps (ADR 0040): the edition
 * carries only the chosen notes or wireframes, an empty choice is refused
 * before anything uploads, a failed update keeps the last edition and can be
 * retried, and the private content stays in the Crux throughout.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function connectForSharing(page: Page) {
  await page.getByPlaceholder('email@example.com').fill('tester@example.com');
  await page.getByRole('button', { name: 'Send Code', exact: true }).click();
  await page.getByPlaceholder('Enter code').fill('123456');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}
async function shareWithoutBackup(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
  await dialog.getByRole('button', { name: 'Share without a backup', exact: true }).click();
}
/** The upload finished: the edition is current, or the app wrote again after it (Notes rewrites its metadata on reload). */
async function shared(page: Page, share: ReturnType<Page['getByTestId']>) {
  await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({ timeout: 120000 });
  await expect(share).toContainText('Shared');
}
async function openSharePane(page: Page) {
  await page
    .getByTestId('workshop-view')
    .getByRole('button', { name: 'Share selected content', exact: true })
    .click();
  return page.getByTestId('pane-body-publish');
}

test('Notes Share uploads only selected saved content; failed updates retain the last edition and can be retried', async () => {
  test.setTimeout(300000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    page.setDefaultTimeout(60000);
    // Tigrana folds its note list away in a narrow frame; three panes need the wider window.
    await page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Shared field journal');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const note = (path: string) => join(folder, 'notebook', path);
    const frame = frameOf(page);
    await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
    await expect.poll(() => existsSync(note('Welcome.md')), { timeout: 60000 }).toBe(true);
    const editor = frame.locator('.tiptap').first();

    // A private note, written in the real editor.
    await frame.getByRole('button', { name: 'Add Note or Folder', exact: true }).click();
    await frame.getByRole('menuitem', { name: /New Note/ }).click();
    await frame.getByRole('button', { name: 'Untitled', exact: true }).first().click();
    const field = frame.getByLabel('Note title', { exact: true });
    await expect(field).toHaveValue('Untitled');
    await field.fill('Private research');
    await field.press('Enter');
    // The rename re-renders the editor; type once the file carries the new name.
    await expect.poll(() => existsSync(note('Private research.md')), { timeout: 30000 }).toBe(true);
    await expect(status(page)).toHaveText('Saved');
    await editor.click();
    await page.keyboard.type('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    await expect
      .poll(() => (existsSync(note('Private research.md')) ? readFileSync(note('Private research.md'), 'utf8') : ''), { timeout: 30000 })
      .toContain('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    await expect(status(page)).toHaveText('Saved');

    // Nothing chosen: refused before anything uploads.
    const share = await openSharePane(page);
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await connectForSharing(page);
    await shareWithoutBackup(page);
    await expect(share.getByRole('alert')).toContainText('Select at least one note');
    expect(api.state.published[id]).toBeUndefined();

    // Choose Welcome in the bar's Public edition panel; write into it and Share without a Save click.
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await frame.locator('#garden-publication input[data-note="Welcome.md"]').check();
    await expect
      .poll(() => JSON.parse(readFileSync(note('publish.json'), 'utf8')).pages)
      .toEqual(['Welcome.md']);
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await frame.getByRole('button', { name: 'Welcome', exact: true }).first().click();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' The first public edition has a freshly written opening.');
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await shareWithoutBackup(page);
    await shared(page, share);
    const uploaded = () =>
      (api.state.published[id] ?? []).map((file) => file.bytes.toString('utf8')).join('\n');
    expect(uploaded()).toContain('freshly written opening');
    expect(uploaded()).not.toContain('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    expect(
      api.state.published[id]!.some(
        (file) => /^(notebook|src)\//.test(file.path) || file.path === 'preview.jpg',
      ),
    ).toBe(false);
    expect(api.state.cruxes[id]!.meta).toMatchObject({ messages: [] });
    const first = uploaded();
    const firstVersion = api.state.publishedVersion;

    // A failed update keeps the last edition and the local draft; the retry lands.
    api.state.failPublish = true;
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' The revised public edition includes a lantern in the woods.');
    await expect
      .poll(() => readFileSync(note('Welcome.md'), 'utf8'), { timeout: 30000 })
      .toContain('lantern in the woods');
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByRole('alert')).toContainText('Simulated outage', { timeout: 60000 });
    expect(uploaded()).toBe(first);
    expect(api.state.publishedVersion).toBe(firstVersion);
    await expect(editor).toContainText('lantern in the woods');
    await expect(
      share.getByRole('button', { name: 'Update shared content', exact: true }),
    ).toBeEnabled();

    api.state.failPublish = false;
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect
      .poll(() => api.state.publishedVersion, { timeout: 120000 })
      .toBe(firstVersion + 1);
    await shared(page, share);
    expect(uploaded()).toContain('lantern in the woods');
    expect(uploaded()).not.toContain('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
    await expect(share.getByRole('alert')).toHaveCount(0);
    // Local private content remains available after every Share attempt.
    await frame.getByRole('button', { name: 'Private research', exact: true }).first().click();
    await expect(editor).toContainText('PRIVATE_RESEARCH_NOT_FOR_VISITORS');
  } finally {
    await app.close();
    await api.close();
  }
});

test('Moqira Share replaces the public selection while retaining excluded frames locally', async () => {
  test.setTimeout(300000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Mockups/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Selected prototype');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const read = () => JSON.parse(readFileSync(join(folder, 'mockups/project.json'), 'utf8'));
    const publication = () =>
      JSON.parse(readFileSync(join(folder, 'mockups/publish.json'), 'utf8'));
    const frame = frameOf(page);
    await expect(status(page)).toHaveText('Saved', { timeout: 120000 });

    // A button placed in the app and saved; then the project opened through the app's own Open
    // with the button's text and a second, private wireframe (as a person would edit it).
    await frame.locator('.library-item').getByText('Button', { exact: true }).click();
    await expect(frame.locator('.canvas-node')).toHaveCount(1);
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(status(page)).toHaveText('Saved');
    await expect.poll(() => read().wireframes[0].nodes.length).toBe(1);
    const project = read();
    project.wireframes[0].name = 'Public screen';
    project.wireframes[0].nodes[0].text = 'Original public prototype';
    project.wireframes.push({
      ...project.wireframes[0],
      id: 'alternative',
      name: 'Alternative',
      nodes: [{ ...project.wireframes[0].nodes[0], id: 'alt-button', text: 'Private alternative prototype' }],
    });
    project.activeWireframeId = project.wireframes[0].id;
    const chooser = page.waitForEvent('filechooser');
    await frame.getByRole('button', { name: 'Open project file…', exact: true }).click();
    await (await chooser).setFiles({
      name: 'prototype.moq',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(frame.getByRole('button', { name: /Alternative/ })).toBeVisible();
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(status(page)).toHaveText('Saved');
    await expect.poll(() => read().wireframes.length).toBe(2);
    const publicId = read().wireframes[0].id as string;

    const choose = async (wireframe: string, on: boolean) => {
      const box = frame.locator(`#garden-publication input[data-wireframe="${wireframe}"]`);
      if (on) await box.check();
      else await box.uncheck();
    };
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await choose(publicId, true);
    await expect.poll(() => publication().wireframes).toEqual([publicId]);
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await expect(status(page)).toHaveText('Saved');

    const share = await openSharePane(page);
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await connectForSharing(page);
    await shareWithoutBackup(page);
    await shared(page, share);
    const uploaded = () =>
      (api.state.published[id] ?? []).map((file) => file.bytes.toString('utf8')).join('\n');
    expect(uploaded()).toContain('Original public prototype');
    expect(uploaded()).not.toContain('Private alternative prototype');
    expect(
      api.state.published[id]!.some(
        (file) => /^(mockups|src)\//.test(file.path) || file.path === 'preview.jpg',
      ),
    ).toBe(false);
    expect(api.state.cruxes[id]!.meta).toMatchObject({ messages: [] });
    const firstVersion = api.state.publishedVersion;

    // Swap the selection: the edition follows, the excluded wireframe stays in the Crux.
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await choose('alternative', true);
    await choose(publicId, false);
    await expect.poll(() => publication().wireframes).toEqual(['alternative']);
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await expect(status(page)).toHaveText('Saved');
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect.poll(() => api.state.publishedVersion, { timeout: 120000 }).toBe(firstVersion + 1);
    await shared(page, share);
    expect(uploaded()).toContain('Private alternative prototype');
    expect(uploaded()).not.toContain('Original public prototype');
    expect(read().wireframes.map((w: { name: string }) => w.name)).toEqual(['Public screen', 'Alternative']);
    await expect(frame.getByRole('button', { name: /Public screen/ })).toBeVisible();

    // Nothing chosen: refused, the last edition stands.
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await choose('alternative', false);
    await expect.poll(() => publication().wireframes).toEqual([]);
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await expect(status(page)).toHaveText('Saved');
    const previousEdition = uploaded();
    const previousVersion = api.state.publishedVersion;
    await share.getByRole('button', { name: 'Update shared content', exact: true }).click();
    await shareWithoutBackup(page);
    await expect(share.getByRole('alert')).toContainText('Select at least one wireframe');
    expect(uploaded()).toBe(previousEdition);
    expect(api.state.publishedVersion).toBe(previousVersion);
    expect(read().wireframes.length).toBe(2);
  } finally {
    await app.close();
    await api.close();
  }
});
