import { validateCommand } from '../../eventcalendar-crux/garden/commands.js';
import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const time = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$' };
const id = { type: 'string', minLength: 1, maxLength: 40 };
const name = { type: 'string', minLength: 1, maxLength: 200 };
const expectedState = { type: 'string', pattern: '^[a-f0-9-]{36}:\\d+$' };
const range = { from: time, to: time };
const eventFields = {
  title: name,
  start: time,
  end: { anyOf: [time, { type: 'string', enum: [''] }] },
  allDay: { type: 'boolean' },
  color: { type: 'string', pattern: '^(#[a-fA-F0-9]{6})?$' },
  notes: { type: 'string', maxLength: 2000 },
};
const definitions: Array<[string, string, string, Record<string, unknown>, string[], string[]]> = [
  [
    'inspect_calendar',
    'inspect',
    'Inspect calendar name/view/date and a bounded page of events including color. Optional from/to filter overlapping events in a local-time half-open range [from,to). Returns total, nextOffset and stateToken. Notes are previews up to 200 characters; read an event for full notes.',
    {
      ...range,
      offset: { type: 'integer', minimum: 0, maximum: 20000 },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
    [],
    [],
  ],
  [
    'set_calendar_name',
    'set-name',
    'Name the calendar (up to 200 characters).',
    { name },
    ['name'],
    ['data/project.json'],
  ],
  [
    'add_calendar_event',
    'add-event',
    'Add an event and show its date. Use real local wall-clock times without timezone. Missing or empty end means one hour, or one day for allDay; all-day boundaries must be midnight. Optional color and notes. Returns createdId.',
    eventFields,
    ['title', 'start'],
    ['data/project.json'],
  ],
  [
    'remove_calendar_event',
    'remove-event',
    'Remove an event by an inspected id. Calendar has no native Undo; Growth preserves saved versions.',
    { id },
    ['id'],
    ['data/project.json'],
  ],
  [
    'read_calendar_event',
    'read-event',
    'Read one event with its full notes and a fresh stateToken.',
    { id },
    ['id'],
    [],
  ],
  [
    'update_calendar_event',
    'update-event',
    'Revise only supplied event fields, preserving manual notes/color and event identity. Changing start alone keeps the existing end: supply a new end when moving beyond it. Empty end uses the default duration. All-day boundaries must be midnight. Supply expectedState from a fresh inspection; stale edits are rejected.',
    { id, ...eventFields, expectedState },
    ['id', 'expectedState'],
    ['data/project.json'],
  ],
  [
    'duplicate_calendar_event',
    'duplicate-event',
    'Copy an inspected event to a new start with a new id. Keeps its duration unless end is supplied, and preserves notes/color unless overridden. Supply expectedState from a fresh inspection. All-day boundaries must be midnight.',
    { id, ...eventFields, expectedState },
    ['id', 'start', 'expectedState'],
    ['data/project.json'],
  ],
  [
    'set_calendar_view',
    'set-view',
    'Show a calendar view and/or date without changing events. Supply expectedState from a fresh inspection. Calendar events use local wall-clock times and have no timezone or recurrence model.',
    {
      view: { type: 'string', enum: ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listWeek'] },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      expectedState,
    },
    ['expectedState'],
    ['data/project.json'],
  ],
  [
    'save_calendar_csv',
    'save-csv',
    'Save an event table as a CSV output with ids, titles, local start/end, all-day status, colors and full notes. Optional from/to filters overlapping events. This is a data table, not an iCalendar subscription. Maximum 32 MB.',
    { label: { type: 'string', minLength: 1, maxLength: 100 }, ...range },
    ['label'],
    ['data/project.json', 'exports/'],
  ],
];
export const EVENTCALENDAR_TOOLS: AppToolDefinition[] = definitions.map(
  ([name, , description, properties, required, writes]) => ({
    name,
    description,
    writes,
    input_schema: { type: 'object', properties, required, additionalProperties: false },
  }),
);
const operations = Object.fromEntries(definitions.map(([name, op]) => [name, op]));
export function eventcalendarCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name) || Object.hasOwn(input, 'op'))
    throw Error('Choose a supported calendar operation.');
  return validateCommand({ ...input, op: operations[name] });
}
