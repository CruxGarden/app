// The Garden document of a Timeline Crux (TimelineJS): data/project.json holds
// the timeline's name and its whole TimelineJS JSON (title, events, eras), so
// the Crux, its history and its archives carry the story without the app's
// browser storage. Plain JavaScript: the host validates with the same code.
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max);
const num = (v) =>
  v === undefined ||
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && /^-?\d{1,15}$/.test(v));
export const MAX_EVENTS = 2000;

function checkDate(d, required, where) {
  if (d === undefined) {
    if (required) throw new Error(`${where} needs a start date with a year.`);
    return;
  }
  if (
    !object(d) ||
    !num(d.year) ||
    d.year === undefined ||
    !num(d.month) ||
    !num(d.day) ||
    !num(d.hour) ||
    !num(d.minute) ||
    !num(d.second) ||
    !num(d.millisecond) ||
    !text(d.display_date, 200) ||
    !text(d.format, 100) ||
    Object.keys(d).some((k) => !['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'display_date', 'format'].includes(k))
  )
    throw new Error(`${where} has an invalid date.`);
}
function checkText(t, where) {
  if (t === undefined) return;
  if (!object(t) || !text(t.headline, 1000) || !text(t.text, 40_000) || Object.keys(t).some((k) => !['headline', 'text'].includes(k)))
    throw new Error(`${where} has invalid text.`);
}
function checkMedia(m, where) {
  if (m === undefined) return;
  if (
    !object(m) ||
    !text(m.url, 4000) ||
    !text(m.caption, 4000) ||
    !text(m.credit, 4000) ||
    !text(m.thumbnail, 4000) ||
    !text(m.alt, 1000) ||
    !text(m.title, 1000) ||
    !text(m.link, 4000) ||
    !text(m.link_target, 40) ||
    Object.keys(m).some((k) => !['url', 'caption', 'credit', 'thumbnail', 'alt', 'title', 'link', 'link_target'].includes(k))
  )
    throw new Error(`${where} has invalid media.`);
}
function checkBackground(b, where) {
  if (b === undefined) return;
  if (!object(b) || !text(b.url, 4000) || !text(b.color, 40) || !text(b.alt, 1000) || Object.keys(b).some((k) => !['url', 'color', 'alt'].includes(k)))
    throw new Error(`${where} has an invalid background.`);
}
function checkSlide(s, where, dated) {
  if (!object(s)) throw new Error(`${where} is not an object.`);
  const allowed = ['unique_id', 'start_date', 'end_date', 'text', 'media', 'group', 'display_date', 'background', 'autolink'];
  if (Object.keys(s).some((k) => !allowed.includes(k))) throw new Error(`${where} has unknown fields.`);
  if (!text(s.unique_id, 120) || (s.unique_id !== undefined && !s.unique_id.trim()))
    throw new Error(`${where} has an invalid unique_id.`);
  checkDate(s.start_date, dated, where);
  checkDate(s.end_date, false, where);
  checkText(s.text, where);
  checkMedia(s.media, where);
  checkBackground(s.background, where);
  if (!text(s.group, 200) || !text(s.display_date, 200) || (s.autolink !== undefined && typeof s.autolink !== 'boolean'))
    throw new Error(`${where} has invalid fields.`);
}

export function validateTimeline(t) {
  if (!object(t) || Object.keys(t).some((k) => !['title', 'events', 'eras', 'scale'].includes(k)))
    throw new Error('Invalid timeline: title, events, eras and scale only.');
  if (t.title !== undefined) checkSlide(t.title, 'The title slide', false);
  if (!Array.isArray(t.events) || t.events.length > MAX_EVENTS)
    throw new Error(`The timeline needs an events list (up to ${MAX_EVENTS}).`);
  const ids = new Set();
  t.events.forEach((e, i) => {
    checkSlide(e, `Event ${i + 1}`, true);
    if (e.unique_id !== undefined) {
      if (ids.has(e.unique_id)) throw new Error(`Event ${i + 1} repeats the unique_id ${e.unique_id}.`);
      ids.add(e.unique_id);
    }
  });
  if (t.eras !== undefined) {
    if (!Array.isArray(t.eras) || t.eras.length > 200) throw new Error('Eras is a list of up to 200 spans.');
    t.eras.forEach((era, i) => {
      if (!object(era) || Object.keys(era).some((k) => !['start_date', 'end_date', 'text'].includes(k)))
        throw new Error(`Era ${i + 1} needs start_date, end_date and text only.`);
      checkDate(era.start_date, true, `Era ${i + 1}`);
      checkDate(era.end_date, true, `Era ${i + 1}`);
      checkText(era.text, `Era ${i + 1}`);
    });
  }
  if (t.scale !== undefined && !['human', 'cosmological'].includes(t.scale))
    throw new Error('Scale is human or cosmological.');
}

export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'timeline' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw new Error('Invalid timeline project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'timeline', 'saved'].includes(k)))
    throw new Error('Invalid timeline project fields.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw new Error('Name the timeline (up to 200 characters).');
  validateTimeline(p.timeline);
  if (typeof p.saved !== 'string' || Number.isNaN(Date.parse(p.saved)))
    throw new Error('Invalid save time.');
}
