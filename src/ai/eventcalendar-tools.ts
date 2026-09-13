import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const time = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$' } as const;
export const EVENTCALENDAR_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_calendar',
    description:
      'Inspect the calendar: its name, the view and date in view, and every event (id, title, start, end, all day, notes).',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_calendar_name',
    description: 'Name the calendar (up to 200 characters).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_calendar_event',
    description:
      'Add an event. Times are local wall-clock strings like 2026-09-15T10:00:00 (no time zone); omit the end for a point in time; set allDay for a whole-day event. The calendar moves to the event.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        start: time,
        end: time,
        allDay: { type: 'boolean' },
        notes: { type: 'string', maxLength: 2000 },
      },
      required: ['title', 'start'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'remove_calendar_event',
    description: 'Remove an event by its id (from inspect_calendar).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, maxLength: 40 } },
      required: ['id'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function eventcalendarCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_calendar' && !keys.length) return { op: 'inspect' };
  if (name === 'set_calendar_name') {
    const value = input.name;
    if (keys.length !== 1 || typeof value !== 'string' || !value.trim() || value.length > 200)
      throw new Error('Use a calendar name up to 200 characters.');
    return { op: 'set-name', name: value.trim() };
  }
  if (name === 'add_calendar_event') {
    const { title, start, end, allDay, notes } = input;
    if (
      keys.some((k) => !['title', 'start', 'end', 'allDay', 'notes'].includes(k)) ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 200 ||
      typeof start !== 'string' ||
      !LOCAL.test(start) ||
      (end !== undefined && (typeof end !== 'string' || !LOCAL.test(end) || end < start)) ||
      (allDay !== undefined && typeof allDay !== 'boolean') ||
      (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000))
    )
      throw new Error(
        'Give a title and a local start like 2026-09-15T10:00:00; an end must not be before the start.',
      );
    return {
      op: 'add-event',
      title: title.trim(),
      start,
      ...(end === undefined ? {} : { end }),
      ...(allDay === undefined ? {} : { allDay }),
      ...(notes === undefined ? {} : { notes }),
    };
  }
  if (name === 'remove_calendar_event') {
    const id = input.id;
    if (keys.length !== 1 || typeof id !== 'string' || !id.trim() || id.length > 40)
      throw new Error('Name the event id to remove.');
    return { op: 'remove-event', id: id.trim() };
  }
  throw new Error('Choose a supported calendar operation.');
}
