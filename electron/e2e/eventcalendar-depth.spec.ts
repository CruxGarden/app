import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux, setAutoCheck } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

test('Calendar tools revise and duplicate events, preserve drafts and manual fields, export CSV and survive complete import', async () => {
  test.setTimeout(360000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir,
    archive = join(dir, 'schedule.crux');
  const evidence = resolve(__dirname, '../../docs/eventcalendar-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '',
    id = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).project;
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
    const done = 'Calendar depth ' + action + ' complete.';
    const count = async () =>
      (await storedCrux(page, id)).messages.filter(
        (m: any) => m.role === 'assistant' && m.content === done,
      ).length;
    const previous = await count();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill('Use Calendar [calendar:depth-' + action + ']');
    await box.press('Enter');
    console.log('Calendar depth:', action);
    await expect.poll(count, { timeout: 60000 }).toBe(previous + 1);
    if (action !== 'draft') await save();
    const errors = (await storedCrux(page, id)).messages
      .flatMap((m: any) => m.toolCalls ?? [])
      .filter((c: any) => c.result?.startsWith('Error'));
    expect(
      errors.filter((c: any) => !c.result.includes('Finish or cancel the open event form')),
    ).toEqual([]);
    if (action === 'draft') expect(errors).toHaveLength(1);
  };
  const notes = 'Manual "quotes", commas\nand the full launch brief.';
  try {
    await instance.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(instance.page);
    await instance.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await instance.page.getByRole('button', { name: /^Calendar/ }).click();
    await instance.page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    id = (await instance.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(instance.page, id)).projectFolder;
    await setAutoCheck(instance.page, false);
    await run('create');
    const originalId = doc().events[0].id;
    expect(doc().events[0].start).toBe('2026-09-15T10:00:30');
    await frame().locator('.ec-event').filter({ hasText: 'Launch review' }).first().click();
    const dialog = frame().locator('#event-dialog');
    await dialog.locator('[name=title]').fill('Manual review');
    await dialog.locator('[name=notes]').fill(notes);
    await dialog.locator('[name=color]').fill('#cc3366');
    // An invalid manual interval stays in the form and cannot be confirmed as saved.
    await dialog.locator('[name=end]').fill('2026-09-15T09:00:30');
    await dialog.locator('#event-save').click();
    await expect(dialog).toBeVisible();
    expect(doc().events[0].title).toBe('Launch review');
    await dialog.locator('[name=end]').fill('2026-09-15T11:30:30');
    await dialog.locator('#event-save').click();
    await save();
    expect(doc().events[0]).toMatchObject({
      id: originalId,
      title: 'Manual review',
      notes,
      color: '#cc3366',
      start: '2026-09-15T10:00:30',
    });
    await run('revise');
    expect(doc().events[0]).toMatchObject({
      id: originalId,
      title: 'Manual review',
      notes,
      color: '#cc3366',
      start: '2026-09-16T14:00:30',
      end: '2026-09-16T15:30:30',
    });
    await run('duplicate');
    expect(doc().events).toHaveLength(2);
    expect(doc().events[1]).toMatchObject({
      title: 'Follow-up review',
      notes,
      color: '#cc3366',
      start: '2026-09-18T09:00:30',
      end: '2026-09-18T10:30:30',
    });
    expect(doc().events[1].id).not.toBe(originalId);
    await run('view');
    expect(doc().view).toBe('listWeek');
    await expect(frame().locator('.ec-event').filter({ hasText: 'Manual review' })).toBeVisible();
    // Unfinished edits remain present and block agent operations.
    await frame().locator('.ec-event').filter({ hasText: 'Manual review' }).click();
    await dialog.locator('[name=title]').fill('Uncommitted title');
    await expect(dialog.locator('[name=title]')).toHaveValue('Uncommitted title');
    await run('draft');
    expect(doc().events[0].title).toBe('Manual review');
    await expect(dialog.locator('[name=title]')).toHaveValue('Uncommitted title');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await save();
    await run('read');
    await run('export');
    const output = outputs(folder).find((o) => o.mimeType === 'text/csv')!;
    const csv = readFileSync(join(folder, output.path), 'utf8');
    expect(csv).toContain('"Manual ""quotes"", commas\nand the full launch brief."');
    expect(csv).toContain('"2026-09-18T10:30:30"');
    expect(output.path).toMatch(/^exports\//);
    writeFileSync(join(evidence, 'launch-schedule.csv'), csv);
    await run('remove');
    expect(doc().events).toHaveLength(1);
    await instance.page.screenshot({ path: join(evidence, 'native-calendar.png') });
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.setViewportSize({ width: 2000, height: 1200 });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await ready();
    expect(doc().view).toBe('listWeek');
    await expect(frame().locator('.ec-event').filter({ hasText: 'Manual review' })).toBeVisible();
    await exportNativeCrux(instance.page, archive, instance.app);
    await instance.app.close();
    const originalFolder = folder;
    renameSync(folder, folder + '-unavailable');
    instance = await launchApp();
    await instance.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(instance.page);
    await importNativeCrux(instance.page, archive);
    await ready();
    id = (await instance.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(instance.page, id)).projectFolder;
    expect(folder).not.toBe(originalFolder);
    expect(doc().events[0]).toMatchObject({
      id: originalId,
      notes,
      color: '#cc3366',
      start: '2026-09-16T14:00:30',
    });
    expect(
      readFileSync(
        join(folder, outputs(folder).find((o) => o.mimeType === 'text/csv')!.path),
        'utf8',
      ),
    ).toBe(csv);
    await frame().locator('.ec-event').filter({ hasText: 'Manual review' }).click();
    await frame().locator('#event-dialog [name=title]').fill('Imported manual continuation');
    await frame().locator('#event-save').click();
    await save();
    expect(doc().events[0]).toMatchObject({
      title: 'Imported manual continuation',
      notes,
      start: '2026-09-16T14:00:30',
    });
    await instance.page.screenshot({ path: join(evidence, 'portable-calendar.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
