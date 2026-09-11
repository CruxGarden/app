import { validateProject } from './model.js';

window.startPiskelGarden = () => startGarden(window.pskl.app).catch(console.error);

export async function startGarden(app) {
  if (parent === window) {
    app.init();
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
  let assetCache = new Map();
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}body{height:calc(100dvh - 34px)!important}#main-wrapper{bottom:34px!important}';
  document.head.append(style);
  document.body.append(bar);
  const workspace = document.querySelector('#main-wrapper');
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
  async function settle() {
    const deadline = Date.now() + 55000;
    while (
      app.mouseStateService.isLeftButtonPressed() ||
      app.mouseStateService.isRightButtonPressed()
    ) {
      if (Date.now() > deadline) throw new Error('Finish the current stroke before saving.');
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  async function capture() {
    const native = JSON.parse(
      window.pskl.utils.serialization.Serializer.serialize(app.piskelController.getPiskel()),
    );
    const nextAssets = new Map();
    const layers = native.piskel.layers.map((layer) => JSON.parse(layer));
    for (const layer of layers)
      for (const chunk of layer.chunks) {
        let ref = assetCache.get(chunk.base64PNG);
        if (!ref) {
          const bytes = await (await fetch(chunk.base64PNG)).arrayBuffer();
          const imported = await call({ op: 'native-import', bytes, mimeType: 'image/png' });
          ref = {
            __cruxBinary: {
              path: imported.path,
              kind: 'buffer',
              type: 'image/png',
              size: bytes.byteLength,
            },
          };
          assetCache.set(chunk.base64PNG, ref);
        }
        nextAssets.set(chunk.base64PNG, ref);
        chunk.base64PNG = ref;
      }
    const result = {
      version: 1,
      app: 'piskel',
      project: { ...native, piskel: { ...native.piskel, layers } },
    };
    validateProject(result);
    assetCache = nextAssets;
    return result;
  }
  async function restore(project) {
    const native = structuredClone(project);
    for (const layer of native.piskel.layers)
      for (const chunk of layer.chunks) {
        const ref = chunk.base64PNG;
        const result = await call({ op: 'native-read', path: ref.__cruxBinary.path });
        const bytes = new Uint8Array(result.bytes);
        const header = new DataView(result.bytes);
        if (
          bytes.length < 24 ||
          [137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value) ||
          header.getUint32(16) !== native.piskel.width * chunk.layout.length ||
          header.getUint32(20) !== native.piskel.height * chunk.layout[0].length
        )
          throw new Error('The sprite sheet dimensions do not match this animation.');
        const bitmap = await createImageBitmap(new Blob([result.bytes], { type: 'image/png' }));
        bitmap.close();
        chunk.base64PNG = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(new Blob([result.bytes], { type: 'image/png' }));
        });
        assetCache.set(chunk.base64PNG, ref);
      }
    native.piskel.layers = native.piskel.layers.map((layer) => JSON.stringify(layer));
    const piskel = await new Promise((resolve, reject) =>
      window.pskl.utils.serialization.Deserializer.deserialize(native, resolve, reject),
    );
    app.piskelController.setPiskel(piskel);
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
        if (revision === saved) window.$.publish(window.Events.PISKEL_SAVED);
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
    name: app.piskelController.getPiskel().getDescriptor().name,
    width: app.piskelController.getWidth(),
    height: app.piskelController.getHeight(),
    fps: app.piskelController.getFPS(),
    frames: app.piskelController.getFrameCount(),
    layers: app.piskelController.getLayers().map((layer) => layer.getName()),
  });
  async function command(value) {
    if (hydrating) throw new Error('Wait for the sprite editor to open.');
    if (value.op === 'inspect') return inspect();
    if (value.op !== 'fps' || !Number.isInteger(value.fps) || value.fps < 1 || value.fps > 24)
      throw new Error('Choose an animation speed from 1 to 24 frames per second.');
    await save();
    app.piskelController.setFPS(value.fps);
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
    app.init();
    if (doc.project) await restore(doc.project);
    for (const key of [
      'HISTORY_STATE_SAVED',
      'HISTORY_STATE_LOADED',
      'PISKEL_DESCRIPTOR_UPDATED',
      'FPS_CHANGED',
    ])
      window.$.subscribe(window.Events[key], dirty);
    window.$.publish(window.Events.PISKEL_SAVED);
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
