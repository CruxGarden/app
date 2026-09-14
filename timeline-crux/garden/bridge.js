// Garden bridge for the Timeline Crux (Crux Garden): a plain module next to the
// unmodified TimelineJS build and the page's small editor. Inside a Workshop
// frame it loads the saved timeline (or the starter timeline.json) into the
// editor, saves after every change, flushes before a close, and answers App
// Tools. On a shared page it loads the timeline and hides the editor.
import { validateProject, validateTimeline } from './document.js';

const framed = window.parent !== window;
let origin;
let expected = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer;
let status = null;
let tail = Promise.resolve();
let commandTail = Promise.resolve();
const pending = new Map();

const show = (text) => {
  if (status) status.textContent = text;
};
const send = (value) =>
  window.parent.postMessage(
    { type: 'crux:app', id: crypto.randomUUID(), ...value },
    origin && origin !== 'null' ? origin : '*',
  );
const call = (value, timeoutMs = 60_000) =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not confirm the save. Your timeline is still open.'));
    }, timeoutMs);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timeout);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timeout);
        reject(e);
      },
    });
    send({ ...value, id });
  });

window.addEventListener('message', (event) => {
  if (!framed) return;
  if (event.source !== window.parent || (origin !== undefined && event.origin !== origin)) return;
  const message = event.data;
  if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return;
  origin = event.origin;
  if (message.type === 'crux:app:result') {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error));
    else request?.resolve(message.result);
  } else if (message.type === 'crux:app:flush') {
    (async () => {
      do {
        await save();
      } while (revision !== saved);
    })().then(
      () => send({ op: 'flushed', flushId: message.id }),
      (error) => send({ op: 'flushed', flushId: message.id, error: error.message }),
    );
  } else if (message.type === 'crux:app:command') {
    const operation = commandTail.then(() => command(message.command));
    commandTail = operation.catch(() => {});
    operation.then(
      (result) => send({ op: 'tool-result', commandId: message.id, result }),
      (error) => send({ op: 'tool-result', commandId: message.id, error: error.message }),
    );
  }
});

const app = () => window.timelineApp;

function dirty() {
  if (hydrating) return;
  revision++;
  send({ op: 'dirty', dirty: true });
  show('Unsaved changes');
  clearTimeout(timer);
  timer = setTimeout(() => save().catch(() => {}), 1500);
}
function save() {
  const operation = tail.then(async () => {
    clearTimeout(timer);
    if (hydrating) throw new Error('Wait for the saved timeline to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving timeline…');
      const { name, timeline } = app().get();
      const doc = {
        version: 1,
        app: 'timeline',
        project: { name, timeline, saved: new Date().toISOString() },
      };
      validateProject(doc);
      const result = await call(
        { op: 'write', path: 'project.json', expected, content: JSON.stringify(doc) },
        120_000,
      );
      expected = result.fingerprint;
      saved = saving;
      send({ op: 'dirty', dirty: revision !== saved });
      show(revision === saved ? 'Saved to Garden' : 'Unsaved changes');
    } catch (error) {
      show(error.message);
      throw error;
    }
  });
  tail = operation.catch(() => {});
  return operation;
}

const dateText = (d) => (d ? [d.year, d.month, d.day].filter((v) => v !== undefined && v !== '').join('-') : null);
function inspect() {
  const { name, timeline } = app().get();
  const events = timeline.events || [];
  return {
    name,
    title: timeline.title?.text?.headline ?? null,
    eventCount: events.length,
    eraCount: (timeline.eras || []).length,
    groups: [...new Set(events.map((e) => e.group).filter(Boolean))],
    events: events.slice(0, 200).map((e) => ({
      unique_id: e.unique_id,
      headline: e.text?.headline ?? '',
      start: dateText(e.start_date),
      end: dateText(e.end_date),
      group: e.group ?? null,
      media: e.media?.url ?? null,
    })),
  };
}
async function command(value) {
  if (hydrating) throw new Error('Wait for the timeline to open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a timeline name up to 200 characters.');
    app().setName(name);
    revision++;
    await save();
    return inspect();
  }
  if (value.op === 'set-timeline') {
    validateTimeline(value.timeline);
    app().set({ timeline: value.timeline });
    revision++;
    await save();
    return inspect();
  }
  if (value.op === 'upsert-events') {
    if (!Array.isArray(value.events) || !value.events.length || value.events.length > 500)
      throw new Error('Give 1 to 500 events.');
    const current = app().get().timeline;
    const merged = { ...current, events: [...(current.events || [])] };
    for (const incoming of value.events) {
      const index = incoming.unique_id ? merged.events.findIndex((e) => e.unique_id === incoming.unique_id) : -1;
      if (index >= 0) merged.events[index] = incoming;
      else merged.events.push(incoming);
    }
    validateTimeline(merged);
    app().upsert(value.events);
    revision++;
    await save();
    return inspect();
  }
  if (value.op === 'remove-events') {
    if (!Array.isArray(value.ids) || !value.ids.length || value.ids.some((id) => typeof id !== 'string'))
      throw new Error('Give the unique_ids of the events to remove.');
    const removed = app().remove(value.ids);
    if (!removed) throw new Error('No event has those unique_ids; inspect the timeline first.');
    revision++;
    await save();
    return { removed, ...inspect() };
  }
  throw new Error('Unsupported timeline operation.');
}

function mountBar() {
  document.body.classList.add('garden');
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML = '<span role="status">Opening Garden project…</span>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c;box-sizing:border-box}#garden-project [role=status]{flex:1}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
}

async function boot() {
  try {
    let doc;
    if (framed) {
      mountBar();
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      doc = JSON.parse(loaded.content);
    } else {
      if (!new URLSearchParams(location.search).has('edit')) document.body.classList.add('view');
      const response = await fetch('data/project.json');
      doc = response.ok ? await response.json() : { version: 1, app: 'timeline', project: null };
    }
    validateProject(doc);
    show('Opening timeline…');
    if (doc.project) app().set({ name: doc.project.name, timeline: doc.project.timeline });
    else {
      const starter = await (await fetch('timeline.json')).json();
      app().set({ name: starter.title?.text?.headline || 'Timeline', timeline: starter });
    }
    hydrating = false;
    if (framed) {
      document.addEventListener('timeline:change', dirty);
      show('Saved to Garden');
      if (!doc.project) {
        revision++;
        save().catch(() => {});
      }
    }
  } catch (error) {
    show(error.message);
    console.error('[garden]', error);
  }
}
void boot();
