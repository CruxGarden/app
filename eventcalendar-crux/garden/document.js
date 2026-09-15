// The Garden document of a calendar Crux: the organizer's plain event list
// (local wall-clock times), the view and the date being looked at.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
export const VIEWS = ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listWeek'];
export function validLocal(value) {
  if (typeof value !== 'string' || !LOCAL.test(value)) return false;
  const parsed = new Date(value + 'Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value;
}
export function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    validLocal(value + 'T00:00:00')
  );
}
export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'eventcalendar' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw Error('Invalid calendar project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (
    !object(p) ||
    Object.keys(p).some((k) => !['name', 'view', 'date', 'events', 'saved'].includes(k))
  )
    throw Error('Invalid calendar record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw Error('Invalid calendar name.');
  if (!VIEWS.includes(p.view)) throw Error('Invalid calendar view.');
  if (typeof p.date !== 'string' || (p.date && !validDate(p.date)))
    throw Error('Invalid calendar date.');
  if (!Array.isArray(p.events) || p.events.length > 20000) throw Error('Invalid event list.');
  const ids = new Set();
  for (const e of p.events) {
    if (
      !object(e) ||
      Object.keys(e).some(
        (k) => !['id', 'title', 'start', 'end', 'allDay', 'color', 'notes'].includes(k),
      )
    )
      throw Error('Invalid event.');
    if (typeof e.id !== 'string' || !e.id || e.id.length > 40) throw Error('Invalid event id.');
    if (ids.has(e.id)) throw Error('Duplicate event id.');
    ids.add(e.id);
    if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200)
      throw Error('Invalid event title.');
    if (!validLocal(e.start)) throw Error('Invalid event start.');
    if (typeof e.end !== 'string' || (e.end && !validLocal(e.end)))
      throw Error('Invalid event end.');
    if (e.end && e.end < e.start) throw Error('Event end must not be before the start.');
    if (typeof e.allDay !== 'boolean') throw Error('Invalid all-day flag.');
    if (typeof e.color !== 'string' || (e.color && !/^#[0-9a-fA-F]{6}$/.test(e.color)))
      throw Error('Invalid event colour.');
    if (typeof e.notes !== 'string' || e.notes.length > 2000) throw Error('Invalid event notes.');
  }
}
