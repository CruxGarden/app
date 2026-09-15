import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCommand,
  createCalendarCommands,
  defaultEnd,
  inspectCalendar,
  calendarCsv,
} from './commands.js';
const token = '11111111-1111-4111-8111-111111111111:1';
const event = {
  id: 'original',
  title: 'Manual review',
  start: '2026-09-15T10:00:00',
  end: '2026-09-15T11:30:00',
  allDay: false,
  notes: 'Keep "quotes", commas\nand newlines.',
  color: '#663399',
};
function fixture() {
  const project = {
    name: 'Calendar',
    view: 'dayGridMonth',
    date: '2026-09-01',
    events: [structuredClone(event)],
  };
  let revision = 1;
  const stateToken = () => token.replace(/:1$/, ':' + revision);
  const organizer = {
    snapshot: () => structuredClone(project),
    setName(name) {
      project.name = name;
      revision++;
    },
    setView(view, date) {
      if (view) project.view = view;
      if (date) project.date = date;
      revision++;
    },
    updateEvent(value) {
      project.events = project.events.map((e) => (e.id === value.id ? value : e));
      revision++;
    },
    addEvent(value) {
      const id = 'copy-' + revision;
      project.events.push({ ...value, id });
      revision++;
      return id;
    },
    removeEvent(id) {
      project.events = project.events.filter((e) => e.id !== id);
      revision++;
    },
  };
  const commands = createCalendarCommands({ organizer, stateToken, saveOutput: (v) => v });
  return {
    project,
    organizer,
    commands,
    stateToken,
    edit: (args) => commands.prepare({ ...args, expectedState: stateToken() }).apply(),
  };
}
test('scoped edits preserve identity and manual fields, copy duration, navigate without touching events', async () => {
  const { project, edit } = fixture();
  await edit({ op: 'update-event', id: 'original', title: 'Agent title' });
  assert.deepEqual(project.events[0], { ...event, title: 'Agent title' });
  await edit({ op: 'duplicate-event', id: 'original', start: '2026-09-17T14:00:00' });
  assert.equal(project.events[1].end, '2026-09-17T15:30:00');
  assert.equal(project.events[1].notes, event.notes);
  assert.notEqual(project.events[1].id, event.id);
  const before = structuredClone(project.events);
  await edit({ op: 'set-view', view: 'listWeek', date: '2026-09-17' });
  assert.deepEqual(project.events, before);
});
test('invalid and stale edits cannot overwrite manual events or silently normalize impossible times', async () => {
  const { project, organizer, commands, edit } = fixture();
  organizer.updateEvent({ ...event, title: 'Manual change' });
  const before = JSON.stringify(project);
  await assert.rejects(
    commands
      .prepare({ op: 'update-event', id: 'original', title: 'Stale', expectedState: token })
      .apply(),
    /changed since/,
  );
  await assert.rejects(
    edit({ op: 'update-event', id: 'original', start: '2026-09-16T10:00:00' }),
    /end must/,
  );
  assert.equal(JSON.stringify(project), before);
  for (const start of [
    '2026-02-30T10:00:00',
    '2026-13-01T10:00:00',
    '2026-09-15T25:00:00',
    '2026-09-15T10:00:00Z',
  ])
    assert.throws(() => validateCommand({ op: 'add-event', title: 'No', start }));
  for (const value of [
    { op: 'update-event', id: 'x', expectedState: token },
    { op: 'inspect', limit: 201 },
    { op: 'set-view', view: 'unknown', expectedState: token },
    { op: 'read-event', id: 'x', extra: true },
  ])
    assert.throws(() => validateCommand(value));
});
test('bounded overlapping range inspection retains full detail through read-event and CSV', async () => {
  const { project, commands } = fixture();
  project.events[0].notes = 'x'.repeat(300);
  project.events.push({
    ...event,
    id: 'second',
    start: '2026-09-16T10:00:00',
    end: '2026-09-16T11:00:00',
  });
  const page = inspectCalendar(project, { limit: 1 }, token);
  assert.equal(page.total, 2);
  assert.equal(page.nextOffset, 1);
  assert.equal(page.events[0].notes.length, 200);
  assert.equal(page.events[0].notesTruncated, true);
  const overlap = inspectCalendar(
    project,
    { from: '2026-09-15T11:00:00', to: '2026-09-15T12:00:00' },
    token,
  );
  assert.equal(overlap.total, 1);
  assert.equal(
    (await commands.prepare({ op: 'read-event', id: 'original' }).apply()).event.notes.length,
    300,
  );
  project.events[0] = { ...event };
  assert.ok(calendarCsv(project).includes('"Keep ""quotes"", commas\nand newlines."'));
});
test('default durations use floating time arithmetic through month/year and DST boundaries', () => {
  assert.equal(defaultEnd({ start: '2026-12-31T23:30:00', allDay: false }), '2027-01-01T00:30:00');
  assert.equal(defaultEnd({ start: '2028-02-28T00:00:00', allDay: true }), '2028-02-29T00:00:00');
  assert.equal(defaultEnd({ start: '2026-03-08T01:30:00', allDay: false }), '2026-03-08T02:30:00');
});
