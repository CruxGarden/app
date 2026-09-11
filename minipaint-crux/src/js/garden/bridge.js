import { validateProject } from '../../../garden/model.js';

export async function startGarden(app) {
  if (parent === window) return;
  let origin;
  let expected = null;
  let revision = 0,
    saved = 0,
    hydrating = true;
  let timer,
    tail = Promise.resolve(),
    commandTail = Promise.resolve();
  const pending = new Map();
  const actions = new Set();
  const rasterCache = new Map();
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}.wrapper{bottom:34px!important}';
  document.head.append(style);
  document.body.append(bar);
  const workspace = document.querySelector('.wrapper');
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
  // Track asynchronous native actions, including undo/redo and JSON imports.
  for (const name of ['do_action', 'undo_action', 'redo_action']) {
    const original = app.State[name].bind(app.State);
    app.State[name] = (...args) => {
      const operation = Promise.resolve().then(() => original(...args));
      actions.add(operation);
      operation.then(
        () => {
          actions.delete(operation);
          dirty();
        },
        () => {
          actions.delete(operation);
          dirty();
        },
      );
      return operation;
    };
  }
  async function settle() {
    while (actions.size) await Promise.all([...actions]);
  }
  async function capture() {
    const project = JSON.parse(app.FileSave.export_as_json());
    const used = new Set();
    for (const image of project.data) {
      const data = image.data;
      used.add(data);
      let ref = rasterCache.get(data);
      if (!ref) {
        const blob = await (await fetch(data)).blob();
        const imported = await call({
          op: 'native-import',
          bytes: await blob.arrayBuffer(),
          mimeType: blob.type,
        });
        ref = {
          __cruxBinary: { path: imported.path, kind: 'blob', type: blob.type, size: blob.size },
        };
        rasterCache.set(data, ref);
      }
      image.data = ref;
    }
    for (const key of rasterCache.keys()) if (!used.has(key)) rasterCache.delete(key);
    const result = { version: 1, app: 'minipaint', project };
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
    width: app.Config.WIDTH,
    height: app.Config.HEIGHT,
    selectedLayer: app.Config.layer?.id,
    layers: app.Config.layers.map(({ id, name, type, visible, opacity, x, y }) => ({
      id,
      name,
      type,
      visible,
      opacity,
      x,
      y,
    })),
  });
  async function command(value) {
    await settle();
    if (value.op === 'inspect') return inspect();
    if (value.op !== 'layer') throw new Error('Unsupported miniPaint operation.');
    const settings = {};
    if (typeof value.name === 'string' && value.name.length <= 200) settings.name = value.name;
    if (typeof value.visible === 'boolean') settings.visible = value.visible;
    if (typeof value.opacity === 'number' && value.opacity >= 0 && value.opacity <= 100)
      settings.opacity = value.opacity;
    if (!Object.keys(settings).length || !Number.isSafeInteger(value.id))
      throw new Error('Choose a layer and valid properties.');
    await save();
    const result = await app.State.do_action(
      new app.Actions.Bundle_action('garden_layer', 'Update Layer', [
        new app.Actions.Refresh_layers_gui_action('undo'),
        new app.Actions.Update_layer_action(value.id, settings),
        new app.Actions.Refresh_layers_gui_action('do'),
      ]),
    );
    if (result.status !== 'completed') throw new Error('The layer could not be changed.');
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
        } while (revision !== saved || actions.size);
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
    if (doc.project) {
      for (const image of doc.project.data) {
        const ref = image.data;
        const asset = await call({ op: 'native-read', path: ref.__cruxBinary.path });
        image.data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(new Blob([asset.bytes], { type: ref.__cruxBinary.type }));
        });
        rasterCache.set(image.data, ref);
      }
      await app.FileOpen.load_json(doc.project);
    }
    await settle();
    hydrating = false;
    workspace.inert = false;
    show('Saved to Garden');

    // Some native controls update the current layer before committing undo state.
    for (const event of ['input', 'change', 'pointerup', 'keyup'])
      document.addEventListener(event, (e) => {
        if (e.target instanceof Node && !bar.contains(e.target)) dirty();
      });
    if (!doc.project) dirty();
  } catch (error) {
    show(error.message);
    throw error;
  }
}
