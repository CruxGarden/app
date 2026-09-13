// Garden bridge for the calendar organizer (Crux Garden). The organizer keeps
// the calendar as plain data; inside a Crux the saved calendar loads before
// the component shows, every change the organizer records marks the project
// dirty, and a confirmed save writes it to data/project.json. Outside a Crux
// this file does nothing (organizer.js keeps the calendar in the browser).
/* global organizer */
(function () {
  const embedded = parent !== window;
  if (!embedded) return;
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  const validateProject = (doc) => {
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
    if (typeof p.view !== 'string' || !/^[a-zA-Z]{4,40}$/.test(p.view))
      throw Error('Invalid calendar view.');
    if (typeof p.date !== 'string' || (p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)))
      throw Error('Invalid calendar date.');
    if (!Array.isArray(p.events) || p.events.length > 20000) throw Error('Invalid event list.');
    for (const e of p.events) {
      if (
        !object(e) ||
        Object.keys(e).some(
          (k) => !['id', 'title', 'start', 'end', 'allDay', 'color', 'notes'].includes(k),
        )
      )
        throw Error('Invalid event.');
      if (typeof e.id !== 'string' || !e.id || e.id.length > 40) throw Error('Invalid event id.');
      if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200)
        throw Error('Invalid event title.');
      if (typeof e.start !== 'string' || !LOCAL.test(e.start)) throw Error('Invalid event start.');
      if (typeof e.end !== 'string' || (e.end && !LOCAL.test(e.end)))
        throw Error('Invalid event end.');
      if (typeof e.allDay !== 'boolean') throw Error('Invalid all-day flag.');
      if (typeof e.color !== 'string' || (e.color && !/^#[0-9a-fA-F]{6}$/.test(e.color)))
        throw Error('Invalid event colour.');
      if (typeof e.notes !== 'string' || e.notes.length > 2000) throw Error('Invalid event notes.');
    }
  };
  let origin,
    expected = null,
    revision = 0,
    saved = 0,
    hydrating = true,
    timer,
    status = null;
  let tail = Promise.resolve(),
    commandTail = Promise.resolve();
  const pending = new Map();
  const show = (text) => {
    if (status) status.textContent = text;
  };
  const send = (value) =>
    parent.postMessage(
      { type: 'crux:app', id: crypto.randomUUID(), ...value },
      origin && origin !== 'null' ? origin : '*',
    );
  const call = (value) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Garden did not confirm the save. Your calendar is still open.'));
      }, 60000);
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
  function dirty() {
    if (hydrating) return;
    revision++;
    send({ op: 'dirty', dirty: true });
    show('Unsaved changes');
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(() => {}), 1200);
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      if (hydrating) throw new Error('Wait for the saved calendar to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving calendar…');
        const doc = {
          version: 1,
          app: 'eventcalendar',
          project: { ...organizer.snapshot(), saved: new Date().toISOString() },
        };
        validateProject(doc);
        const result = await call({
          op: 'write',
          path: 'project.json',
          expected,
          content: JSON.stringify(doc),
        });
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
  function inspect() {
    const p = organizer.snapshot();
    return {
      name: p.name,
      view: p.view,
      date: p.date,
      events: p.events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        notes: e.notes,
      })),
    };
  }
  async function command(value) {
    if (hydrating) throw new Error('Wait for the calendar to open.');
    if (value.op === 'inspect') return inspect();
    if (value.op === 'set-name') {
      const name = String(value.name ?? '').trim();
      if (!name || name.length > 200) throw new Error('Use a calendar name up to 200 characters.');
      organizer.setName(name);
    } else if (value.op === 'add-event') {
      const title = String(value.title ?? '').trim();
      const start = String(value.start ?? '');
      const end = value.end === undefined ? '' : String(value.end);
      if (!title || title.length > 200) throw new Error('Use an event title up to 200 characters.');
      if (!LOCAL.test(start) || (end && !LOCAL.test(end)))
        throw new Error('Use local times like 2026-09-15T10:00:00.');
      if (end && end < start) throw new Error('The end must not be before the start.');
      const notes = value.notes === undefined ? '' : String(value.notes);
      if (notes.length > 2000) throw new Error('Use notes up to 2000 characters.');
      organizer.addEvent({ title, start, end, allDay: value.allDay === true, notes });
    } else if (value.op === 'remove-event') {
      if (!organizer.removeEvent(String(value.id ?? ''))) throw new Error('No event with that id.');
    } else throw new Error('Unsupported calendar operation.');
    await save();
    return inspect();
  }
  window.addEventListener('message', (event) => {
    if (event.source !== parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:'))
      return;
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
  async function boot() {
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML = '<span role="status">Opening Garden project…</span>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}main{height:calc(100% - 32px)!important}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    try {
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      organizer.load(doc.project);
      organizer.onChange(() => dirty());
      hydrating = false;
      show('Saved to Garden');
      if (!doc.project) {
        revision++;
        save().catch(() => {});
      } // the first save records the empty calendar
    } catch (error) {
      show(error.message);
      throw error;
    }
  }
  boot();
})();
