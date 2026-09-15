import { validateProject, validLocal, validDate, VIEWS } from './document.js';
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = (v, max, empty = false) =>
  typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0);
const fields = ['title', 'start', 'end', 'allDay', 'color', 'notes'];
const shapes = {
  inspect: ['from', 'to', 'offset', 'limit'],
  'read-event': ['id'],
  'set-name': ['name'],
  'add-event': fields,
  'remove-event': ['id'],
  'update-event': ['id', ...fields, 'expectedState'],
  'duplicate-event': ['id', ...fields, 'expectedState'],
  'set-view': ['view', 'date', 'expectedState'],
  'save-csv': ['label', 'from', 'to'],
};
export function validateCommand(value) {
  if (
    !object(value) ||
    !Object.hasOwn(shapes, value.op) ||
    Object.keys(value).some((k) => k !== 'op' && !shapes[value.op].includes(k))
  )
    throw Error('Choose a supported calendar operation and its declared fields.');
  const v = { ...value };
  for (const k of ['title', 'name', 'label'])
    if (k in v) {
      if (!string(v[k], k === 'label' ? 100 : 200))
        throw Error('Use a nonempty name or title within the stated limit.');
      v[k] = v[k].trim();
    }
  if ('id' in v && !string(v.id, 40)) throw Error('Choose an inspected event id.');
  for (const k of ['start', 'from', 'to'])
    if (k in v && !validLocal(v[k]))
      throw Error('Use a real local date/time like 2026-09-15T10:00:00, without a timezone.');
  if ('end' in v && v.end !== '' && !validLocal(v.end))
    throw Error('Use a real local end time, or an empty string for the default duration.');
  if (v.end && v.start && v.end < v.start) throw Error('The end must not be before the start.');
  if (v.from && v.to && v.to <= v.from) throw Error('The range end must be after its start.');
  if ('allDay' in v && typeof v.allDay !== 'boolean') throw Error('Use a boolean allDay value.');
  if (
    'color' in v &&
    v.color !== '' &&
    (typeof v.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(v.color))
  )
    throw Error('Use a six-digit hex color or empty string.');
  if ('notes' in v && !string(v.notes, 2000, true)) throw Error('Use notes up to 2000 characters.');
  for (const [k, min, max] of [
    ['offset', 0, 20000],
    ['limit', 1, 200],
  ])
    if (k in v && (!Number.isInteger(v[k]) || v[k] < min || v[k] > max))
      throw Error('Use a valid inspection offset and limit (1–200).');
  if ('view' in v && !VIEWS.includes(v.view))
    throw Error('Choose month, week, day or list using a supported view id.');
  if ('date' in v && !validDate(v.date)) throw Error('Use a real date like 2026-09-15.');
  if (
    ['update-event', 'duplicate-event', 'set-view'].includes(v.op) &&
    (typeof v.expectedState !== 'string' || !/^[a-f0-9-]{36}:\d+$/.test(v.expectedState))
  )
    throw Error('Supply expectedState from a fresh calendar inspection.');
  const required = {
    'read-event': ['id'],
    'set-name': ['name'],
    'add-event': ['title', 'start'],
    'remove-event': ['id'],
    'update-event': ['id'],
    'duplicate-event': ['id', 'start'],
    'set-view': [],
    'save-csv': ['label'],
    inspect: [],
  };
  if (required[v.op].some((k) => !(k in v))) throw Error('Supply the required calendar fields.');
  if (v.op === 'update-event' && !fields.some((k) => k in v))
    throw Error('Supply at least one event field to update.');
  if (v.op === 'set-view' && !('view' in v) && !('date' in v))
    throw Error('Supply a view or date.');
  return v;
}
const floating = (text) => Date.parse(text + 'Z');
const stamp = (value) => new Date(value).toISOString().slice(0, 19);
export function defaultEnd(event) {
  const start = event.allDay ? event.start.slice(0, 10) + 'T00:00:00' : event.start;
  return stamp(floating(start) + (event.allDay ? 86400000 : 3600000));
}
function ranged(events, args) {
  return events.filter(
    (e) =>
      (!args.to || e.start < args.to) &&
      (!args.from || (e.end && e.end > e.start ? e.end > args.from : e.start >= args.from)),
  );
}
export function inspectCalendar(project, args, stateToken) {
  const events = ranged(project.events, args);
  const offset = args.offset ?? 0,
    limit = args.limit ?? 100;
  return {
    name: project.name,
    view: project.view,
    date: project.date,
    stateToken,
    total: events.length,
    offset,
    nextOffset: offset + limit < events.length ? offset + limit : null,
    events: events
      .slice(offset, offset + limit)
      .map((e) => ({ ...e, notes: e.notes.slice(0, 200), notesTruncated: e.notes.length > 200 })),
    limits: { events: limit, notes: 200 },
  };
}
export function calendarCsv(project, args = {}) {
  const quote = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const columns = ['id', ...fields];
  return (
    [columns, ...ranged(project.events, args).map((e) => columns.map((k) => e[k]))]
      .map((row) => row.map(quote).join(','))
      .join('\r\n') + '\r\n'
  );
}
export function createCalendarCommands({ organizer, stateToken, saveOutput }) {
  const inspect = (args = {}) => inspectCalendar(organizer.snapshot(), args, stateToken());
  return {
    prepare(value) {
      const args = validateCommand(value);
      return {
        mutates: !['inspect', 'read-event'].includes(args.op),
        async apply() {
          if (args.expectedState && args.expectedState !== stateToken())
            throw Error('Calendar changed since inspection. Inspect again before editing.');
          if (args.op === 'inspect') return inspect(args);
          const project = organizer.snapshot();
          const source = args.id ? project.events.find((e) => e.id === args.id) : undefined;
          if (args.id && !source) throw Error('No event with that id. Inspect the calendar again.');
          if (args.op === 'read-event') return { event: source, stateToken: stateToken() };
          if (args.op === 'save-csv') {
            const bytes = new TextEncoder().encode(calendarCsv(project, args));
            if (bytes.length > 32000000)
              throw Error('Choose a smaller date range; outputs are limited to 32 MB.');
            return saveOutput({ label: args.label, mimeType: 'text/csv', bytes: bytes.buffer });
          }
          let createdId;
          if (args.op === 'set-name') organizer.setName(args.name);
          else if (args.op === 'remove-event') organizer.removeEvent(args.id);
          else if (args.op === 'set-view') organizer.setView(args.view, args.date);
          else {
            const changes = Object.fromEntries(
              fields.filter((k) => k in args).map((k) => [k, args[k]]),
            );
            const event = {
              id: 'new',
              title: '',
              start: '',
              end: '',
              allDay: false,
              color: '',
              notes: '',
              ...source,
              ...changes,
            };
            if (args.op === 'duplicate-event' && !('end' in args) && source.end)
              event.end = stamp(
                floating(event.start) + floating(source.end) - floating(source.start),
              );
            if (!event.end) event.end = defaultEnd(event);
            if (
              event.allDay &&
              (!event.start.endsWith('T00:00:00') || !event.end.endsWith('T00:00:00'))
            )
              throw Error('Use midnight start and end boundaries for an all-day event.');
            validateProject({
              version: 1,
              app: 'eventcalendar',
              project: { ...project, events: [event] },
            });
            if (args.op === 'update-event') organizer.updateEvent(event);
            else {
              if (project.events.length >= 20000)
                throw Error('Calendar is limited to 20000 events.');
              const { id: _id, ...copy } = event;
              createdId = organizer.addEvent(copy);
            }
          }
          return { ...inspect(), ...(createdId ? { createdId } : {}) };
        },
      };
    },
  };
}
