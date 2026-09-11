import { validateProject, STORAGE_KEYS } from './model.js';

const app = window;
window.gardenStart = () => startGarden(app).catch(console.error);

export async function startGarden(app) {
  if (parent === window) {
    app.start();
    return;
  }
  let origin;
  let expected = null;
  let revision = 0,
    saved = 0,
    hydrating = true;
  let timer,
    tail = Promise.resolve(),
    commandTail = Promise.resolve();
  const pending = new Map();
  let storage = Object.create(null);
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#appRoot{height:calc(100dvh - 34px)!important}';
  document.head.append(style);
  document.body.append(bar);
  const workspace = document.querySelector('#appRoot');
  workspace.inert = true;
  const status = bar.querySelector('span');
  const show = (text) => {
    status.textContent = text;
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
        reject(new Error('Garden did not confirm the save. Your draft is still open.'));
      }, 60000);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
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
    timer = setTimeout(() => save().catch(() => {}), 800);
  }
  app.Store.getDriver = () => ({
    getItem: (key) => storage[key] ?? null,
    setItem: (key, value) => {
      storage[key] = value;
      if (STORAGE_KEYS.includes(key)) dirty();
    },
    removeItem: (key) => {
      delete storage[key];
      if (STORAGE_KEYS.includes(key)) dirty();
    },
  });
  async function settle() {}
  async function capture() {
    const result = {
      version: 1,
      app: 'bitsy',
      project: {
        storage: Object.fromEntries(
          Object.entries(storage).filter(([key]) => STORAGE_KEYS.includes(key)),
        ),
      },
    };
    validateProject(result);
    return result;
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      await settle();
      if (hydrating) throw new Error('Wait for the saved project to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving project…');
        const doc = await capture();
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
  const inspect = () => ({
    title: app.getTitle(),
    rooms: Object.keys(app.room),
    sprites: Object.keys(app.sprite),
    items: Object.keys(app.item),
    dialogs: Object.keys(app.dialog),
  });
  async function command(value) {
    if (hydrating) throw new Error('Wait for the game to open.');
    if (value.op === 'inspect') return inspect();
    if (
      value.op !== 'title' ||
      typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.length > 300
    )
      throw new Error('Choose a game title up to 300 characters.');
    if (app.isPlayMode) throw new Error('Stop playing before editing the game.');
    await save();
    app.on_change_title({ target: { value: value.title } });
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
  bar.querySelectorAll('button')[0].onclick = () => save().catch(() => {});
  bar.querySelectorAll('button')[1].onclick = () => {
    if (revision === saved || confirm('Discard the unsaved draft and reload the saved project?'))
      location.reload();
  };
  try {
    const loaded = await call({ op: 'read', path: 'project.json' });
    expected = loaded.fingerprint;
    const doc = JSON.parse(loaded.content);
    validateProject(doc);
    if (doc.project) storage = Object.assign(Object.create(null), doc.project.storage);
    app.start();
    await settle();
    hydrating = false;
    workspace.inert = false;
    show('Saved to Garden');

    if (!doc.project) dirty();
  } catch (error) {
    show(error.message);
    throw error;
  }
}
