import { expect, it } from 'vitest';
import { EVENTCALENDAR_TOOLS, eventcalendarCommand } from './eventcalendar-tools';
it('maps calendar operations and refuses bad input', () => {
  expect(EVENTCALENDAR_TOOLS.map((t) => t.name)).toEqual([
    'inspect_calendar',
    'set_calendar_name',
    'add_calendar_event',
    'remove_calendar_event',
    'read_calendar_event',
    'update_calendar_event',
    'duplicate_calendar_event',
    'set_calendar_view',
    'save_calendar_csv',
  ]);
  expect(eventcalendarCommand('inspect_calendar', {})).toEqual({ op: 'inspect' });
  expect(eventcalendarCommand('set_calendar_name', { name: ' Launch calendar ' })).toEqual({
    op: 'set-name',
    name: 'Launch calendar',
  });
  expect(
    eventcalendarCommand('add_calendar_event', {
      title: 'Review',
      start: '2026-09-15T10:00:00',
      end: '2026-09-15T11:00:00',
    }),
  ).toEqual({
    op: 'add-event',
    title: 'Review',
    start: '2026-09-15T10:00:00',
    end: '2026-09-15T11:00:00',
  });
  expect(
    eventcalendarCommand('add_calendar_event', {
      title: 'Offsite',
      start: '2026-09-20T00:00:00',
      allDay: true,
    }),
  ).toEqual({
    op: 'add-event',
    title: 'Offsite',
    start: '2026-09-20T00:00:00',
    allDay: true,
  });
  expect(eventcalendarCommand('remove_calendar_event', { id: 'a1b2c3d4' })).toEqual({
    op: 'remove-event',
    id: 'a1b2c3d4',
  });
  for (const [name, input] of [
    ['inspect_calendar', { x: 1 }],
    ['set_calendar_name', { name: '' }],
    ['add_calendar_event', { title: 'Review', start: '2026-09-15 10:00' }],
    ['add_calendar_event', { title: 'Review', start: '2026-09-15T10:00:00Z' }],
    [
      'add_calendar_event',
      { title: 'Review', start: '2026-09-15T10:00:00', end: '2026-09-15T09:00:00' },
    ],
    ['add_calendar_event', { title: '', start: '2026-09-15T10:00:00' }],
    ['remove_calendar_event', { id: '' }],
    ['move_calendar_event', { id: 'x' }],
  ] as const)
    expect(() => eventcalendarCommand(name, input as Record<string, unknown>), name).toThrow();
});

it('shares native validation for targeted edits and rejects extra fields or stale-token shapes', () => {
  const expectedState = '11111111-1111-4111-8111-111111111111:2';
  expect(
    eventcalendarCommand('update_calendar_event', { id: 'a', notes: 'Keep me', expectedState }),
  ).toEqual({ op: 'update-event', id: 'a', notes: 'Keep me', expectedState });
  expect(
    eventcalendarCommand('inspect_calendar', { from: '2026-09-01T00:00:00', limit: 20 }),
  ).toMatchObject({ op: 'inspect', limit: 20 });
  expect(() =>
    eventcalendarCommand('add_calendar_event', { title: 'No', start: '2026-02-30T10:00:00' }),
  ).toThrow();
  expect(() =>
    eventcalendarCommand('set_calendar_view', { view: 'listWeek', expectedState: 'stale' }),
  ).toThrow();
  expect(() => eventcalendarCommand('update_calendar_event', { id: 'a', expectedState })).toThrow();
  expect(() =>
    eventcalendarCommand('read_calendar_event', { id: 'a', op: 'remove-event' }),
  ).toThrow();
});
