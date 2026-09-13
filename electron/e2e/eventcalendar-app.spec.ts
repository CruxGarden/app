import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * The calendar organizer (the actual EventCalendar component with its drag
 * editing, plus one event form) as a Crux Tool: an event added by selecting
 * days and moved by dragging reaches data/project.json, the scripted
 * collaborator adds an event and names the calendar, the calendar survives a
 * restart, and a complete Crux archive imports into a clean Garden with the
 * folder gone, where editing continues.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('.ec')).toBeVisible();
}
const events = (page: Page) => frameOf(page).locator('.ec-event');
/** Drag with the real pointer from the middle of one element to the middle of another. */
async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
const middle = async (page: Page, selector: string, nth: number) => {
  const box = (await frameOf(page).locator(selector).nth(nth).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('Calendar: real selection, drag and form edits, agent tools, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/eventcalendar');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'calendar.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const list = () =>
    doc().project.events as {
      id: string;
      title: string;
      start: string;
      end: string;
      allDay: boolean;
    }[];
  const errors: string[] = [];
  let firstStart = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1500, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the month view opens and the empty calendar saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Calendar/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Calendar folder', folder);
      await ready(page);
      await expect(frameOf(page).locator('.ec-day')).not.toHaveCount(0);
      await expect.poll(() => doc().project?.view ?? '').toBe('dayGridMonth');
      expect(list()).toEqual([]);
      await page.screenshot({ path: join(evidence, 'calendar-initial.png') });
    });

    await test.step('a person selects two days and fills the form; the event is saved', async () => {
      await dragBetween(page, await middle(page, '.ec-day', 9), await middle(page, '.ec-day', 10));
      const dialog = frameOf(page).locator('#event-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#event-dialog-title')).toHaveText('New event');
      await dialog.locator('[name=title]').fill('Team offsite');
      await dialog.locator('#event-save').click();
      await expect(events(page)).toHaveCount(1);
      await expect(events(page).first()).toContainText('Team offsite');
      await ready(page);
      await expect.poll(() => list().length).toBe(1);
      expect(list()[0]).toMatchObject({ title: 'Team offsite', allDay: true });
      expect(list()[0].start).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
      firstStart = list()[0].start;
      await page.screenshot({ path: join(evidence, 'calendar-event.png') });
    });

    await test.step('a person drags the event to another day; the move is saved', async () => {
      await dragBetween(
        page,
        await middle(page, '.ec-event', 0),
        await middle(page, '.ec-day', 17),
      );
      await ready(page);
      await expect.poll(() => list()[0].start, { timeout: 30000 }).not.toBe(firstStart);
      expect(list()[0].title).toBe('Team offsite');
    });

    await test.step('the scripted collaborator adds an event and names the calendar', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Add the launch review and name this [calendar:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Added Garden launch review and named the calendar Launch calendar.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 150000 });
      await ready(page);
      expect(doc().project.name).toBe('Launch calendar');
      expect(list().length).toBe(2);
      expect(list().find((e) => e.title === 'Garden launch review')).toMatchObject({
        start: '2026-09-15T10:00:00',
        end: '2026-09-15T11:00:00',
        allDay: false,
      });
      await expect(events(page).filter({ hasText: 'Garden launch review' })).toHaveCount(1);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'calendar-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await test.step('restart: both events and the view come back', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      await expect(events(page).filter({ hasText: 'Garden launch review' })).toHaveCount(1);
      await page.screenshot({ path: join(evidence, 'calendar-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const third = await launchApp();
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await test.step('clean Garden: the complete Crux imports and an event is edited through the form', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      expect(list().length).toBe(2);
      await events(page).filter({ hasText: 'Garden launch review' }).first().click();
      const dialog = frameOf(page).locator('#event-dialog');
      await expect(dialog.locator('#event-dialog-title')).toHaveText('Edit event');
      await dialog.locator('[name=title]').fill('Garden launch review, moved');
      await dialog.locator('#event-save').click();
      await ready(page);
      await expect
        .poll(() => list().some((e) => e.title === 'Garden launch review, moved'))
        .toBe(true);
      await page.screenshot({ path: join(evidence, 'calendar-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
