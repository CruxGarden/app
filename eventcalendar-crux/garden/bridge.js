import { validateProject } from './document.js';
import { createCalendarCommands } from './commands.js';
import { createCommandSession } from './shared/command-session.js';
// Garden bridge for the calendar organizer (Crux Garden). The organizer keeps
// the calendar as plain data; inside a Crux the saved calendar loads before
// the component shows, every change the organizer records marks the project
// dirty, and a confirmed save writes it to data/project.json. Outside a Crux
// this file does nothing (organizer.js keeps the calendar in the browser).
/* global organizer */
(function () {
  const embedded = parent !== window;
  if (!embedded) return;
  let origin,
    expected = null,
    revision = 0,
    saved = 0,
    hydrating = true,
    timer,
    status = null;
  let tail = Promise.resolve(),
    commandTail = Promise.resolve();
  const sessionId = crypto.randomUUID();
  const stateToken = () => sessionId + ':' + revision;
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
      if (organizer.hasDraft())
        throw Error('Finish or cancel the open event form before saving or leaving Calendar.');
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
  const commands = createCalendarCommands({
    organizer,
    stateToken,
    saveOutput: (value) => call({ op: 'save-output', ...value }),
  });
  const session = createCommandSession({
    settle: async () => {
      if (hydrating) throw Error('Wait for the calendar to open.');
      if (organizer.hasDraft())
        throw Error('Finish or cancel the open event form before using Calendar tools.');
      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    prepare: (value) => commands.prepare(value),
    save,
  });
  const command = (value) => session.execute(value);
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
    bar.innerHTML =
      '<span role="status">Opening Garden project…</span><button>Save project</button>';
    bar.querySelector('button').onclick = () => save().catch((error) => show(error.message));
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;gap:12px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#35433a;border:1px solid #64756a;border-radius:3px}main{height:calc(100% - 32px)!important}';
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
