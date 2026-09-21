import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux, setAutoCheck } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1kAAAAASUVORK5CYII=',
  'base64',
);
test('Kan scoped tools preserve manual content, originals and native history through restart and complete import', async () => {
  test.setTimeout(480000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const firstDir = instance.dir,
    archive = join(firstDir, 'launch-board.crux');
  const evidence = resolve(__dirname, '../../docs/kan-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '',
    id = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const board = () => {
    const project = doc().project;
    const key = Object.keys(project).find((key) => key.startsWith('record-["kan","board"'))!;
    return JSON.parse(readFileSync(join(folder, 'data', project[key].__cruxBinary.path), 'utf8'));
  };
  const card = (title = 'Manual launch title') =>
    board()
      .lists.flatMap((l: any) => l.cards)
      .find((c: any) => c.title === title);
  const originals = () =>
    Object.entries(doc().project)
      .filter(([key]) => key.startsWith('file-'))
      .map(([, ref]: [string, any]) => readFileSync(join(folder, 'data', ref.__cruxBinary.path)));
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const run = async (action: string) => {
    const page = instance.page,
      toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const done = 'Kan depth ' + action + ' complete.';
    const count = async () =>
      (await storedCrux(page, id)).messages.filter(
        (m: any) => m.role === 'assistant' && m.content === done,
      ).length;
    const previous = await count();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill('Use Kan [kan:depth-' + action + ']');
    await box.press('Enter');
    console.log('Kan depth:', action);
    await expect.poll(count, { timeout: 75000 }).toBe(previous + 1);
    await save();
    expect(
      (await storedCrux(page, id)).messages
        .flatMap((m: any) => m.toolCalls ?? [])
        .filter((c: any) => c.result?.startsWith('Error')),
    ).toEqual([]);
  };
  try {
    await instance.page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(instance.page);
    await instance.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await instance.page.getByRole('button', { name: /^Kan/ }).click();
    await instance.page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    id = (await instance.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(instance.page, id)).projectFolder;
    // This journey checks native records and screenshots itself. The generic mock
    // visual checker intentionally reports a missing landing-page heading.
    await setAutoCheck(instance.page, false);
    await run('board');
    await frame().getByText('Launch', { exact: true }).first().click();
    await expect(frame().getByRole('textbox', { name: 'Board name', exact: true })).toHaveValue(
      'Launch',
    );
    await ready();
    await run('card');
    await frame().getByText('Ship the home page', { exact: true }).click();
    await frame().locator('#title').fill('Manual launch title');
    const editor = frame().locator('.tiptap[contenteditable=true]').first();
    await editor.fill('Keep this manually formatted brief.');
    await editor.press('Meta+a');
    await editor.press('Meta+b');
    await frame().locator('#title').click();
    await frame()
      .locator('#attachment-upload')
      .setInputFiles({ name: 'launch.png', mimeType: 'image/png', buffer: PIXEL });
    await frame().locator('img[alt="launch.png"]').first().waitFor();
    await save();
    const description = card().description;
    expect(description).toContain('<strong>');
    await run('details');
    expect(card().title).toBe('Manual launch title');
    expect(card().description).toBe(description);
    expect(card().dueDate).toBe('2026-10-01T12:00:00.000Z');
    for (const action of ['label', 'assign', 'checklist', 'item', 'complete', 'rename-checklist'])
      await run(action);
    expect(card().labels[0].name).toBe('Launch priority');
    expect(card().checklists[0].name).toBe('Ready to ship');
    expect(card().checklists[0].items[0]).toMatchObject({
      title: 'Small screens verified',
      completed: true,
    });
    await run('duplicate');
    expect(card('Follow-up').checklists[0].items[0].completed).toBe(false);
    expect(card('Follow-up').attachments).toEqual([]);
    expect(card().checklists[0].items[0].completed).toBe(true);
    await run('reorder');
    expect(
      board()
        .lists.filter((l: any) => !l.deletedAt)
        .sort((a: any, b: any) => a.index - b.index)
        .map((l: any) => l.name),
    ).toEqual(['Ideas', 'Shipped', 'Doing']);
    await run('delete-copy');
    expect(card('Follow-up').deletedAt).toBeTruthy();
    expect(card().activities.length).toBeGreaterThan(4);
    expect(originals().some((bytes) => bytes.equals(PIXEL))).toBe(true);
    await expect(frame().locator('#title')).toHaveValue('Manual launch title');
    await expect(
      frame()
        .getByRole('paragraph')
        .filter({ hasText: /^Small screens verified$/ }),
    ).toBeVisible();
    await expect(frame().getByRole('checkbox').first()).toBeChecked();
    await instance.page.screenshot({ path: join(evidence, 'native-card.png') });
    await instance.app.close();
    instance = await launchApp({ dir: firstDir });
    await instance.page.setViewportSize({ width: 2200, height: 1250 });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await ready();
    await expect(frame().locator('#title')).toHaveValue('Manual launch title');
    await expect(
      frame()
        .getByRole('paragraph')
        .filter({ hasText: /^Small screens verified$/ }),
    ).toBeVisible();
    expect(card().description).toBe(description);
    await exportNativeCrux(instance.page, archive, instance.app);
    await instance.app.close();
    const originalFolder = folder;
    renameSync(originalFolder, originalFolder + '-unavailable');
    instance = await launchApp();
    await instance.page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(instance.page);
    await importNativeCrux(instance.page, archive);
    await ready();
    id = (await instance.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(instance.page, id)).projectFolder;
    expect(folder).not.toBe(originalFolder);
    expect(card().description).toBe(description);
    expect(card().checklists[0].items[0].completed).toBe(true);
    expect(card('Follow-up').deletedAt).toBeTruthy();
    expect(originals().some((bytes) => bytes.equals(PIXEL))).toBe(true);
    await frame().locator('img[alt="launch.png"]').first().waitFor();
    await expect(frame().getByRole('checkbox').first()).toBeChecked();
    await frame().getByRole('checkbox').first().uncheck();
    await save();
    expect(card().checklists[0].items[0].completed).toBe(false);
    await frame().getByRole('checkbox').first().check();
    await frame().locator('#title').fill('Imported manual continuation');
    await save();
    expect(card('Imported manual continuation').checklists[0].items[0].completed).toBe(true);
    await instance.page.screenshot({ path: join(evidence, 'portable-card.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
