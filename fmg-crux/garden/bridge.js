// Garden bridge for the Fantasy Map Crux (Crux Garden). A plain module loaded
// after upstream's bundle, inert outside a Workshop frame. Inside: once the
// app has a map on screen it opens the saved .map from data/project.json
// through upstream's own load path (or keeps the fresh world and saves it),
// then compares the save text every 20 s (the app has no change event), saves
// with the fingerprint guard, flushes before a close, and puts PNG/SVG renders
// into the Crux's outputs. App Tools drive the same operations.
import { validateProject } from './document.js';

const framed = window.parent !== window;
const WATCH_MS = 20_000;
let origin;
let expected = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer;
let status = null;
let lastMap = '';
let tail = Promise.resolve();
let commandTail = Promise.resolve();
const pending = new Map();
const state = { name: 'New World' };

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
      reject(new Error('Garden did not confirm the save. Your map is still open.'));
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
      if (!hydrating) await checkForChanges();
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

// Upstream's globals: `options`, `pack`, `mapHistory`, `Services` (a lazy registry: every method returns a promise)
const g = globalThis;
const mapData = () => g.Services.Save.prepareMapData();
const mapName = () => (g.options?.map?.lore?.name || state.name).trim() || state.name;

function dirty() {
  if (hydrating) return;
  revision++;
  send({ op: 'dirty', dirty: true });
  show('Unsaved changes');
  clearTimeout(timer);
  timer = setTimeout(() => save().catch(() => {}), 1500);
}
async function checkForChanges() {
  try {
    const data = await mapData();
    if (data !== lastMap) {
      lastMap = data;
      dirty();
    }
  } catch {
    /* mid-edit; the next tick compares again */
  }
}
function save() {
  const operation = tail.then(async () => {
    clearTimeout(timer);
    if (hydrating) throw new Error('Wait for the saved map to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving map…');
      const map = await mapData();
      // The save text goes in as a Garden binary asset; the document keeps a reference to it
      const bytes = new TextEncoder().encode(map).buffer;
      const stored = await call({ op: 'native-import', bytes, mimeType: 'text/plain' }, 120_000);
      const ref = {
        __cruxBinary: {
          path: stored.path,
          kind: 'buffer',
          type: 'text/plain',
          size: bytes.byteLength,
        },
      };
      const doc = {
        version: 1,
        app: 'fmg',
        project: {
          name: mapName(),
          seed: String(g.options?.map?.seed ?? ''),
          map: ref,
          saved: new Date().toISOString(),
        },
      };
      validateProject(doc);
      const result = await call(
        { op: 'write', path: 'project.json', expected, content: JSON.stringify(doc) },
        120_000,
      );
      expected = result.fingerprint;
      lastMap = map;
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
  const pack = g.pack ?? {};
  return {
    name: mapName(),
    seed: String(g.options?.map?.seed ?? ''),
    width: g.options?.map?.graph?.width,
    height: g.options?.map?.graph?.height,
    cells: pack.cells?.i?.length ?? 0,
    burgs: Math.max(0, (pack.burgs?.length ?? 1) - 1),
    states: Math.max(0, (pack.states?.length ?? 1) - 1),
    cultures: Math.max(0, (pack.cultures?.length ?? 1) - 1),
    maps: g.mapHistory?.length ?? 0,
  };
}
async function renderPng() {
  const url = await g.Services.ExportMap.getMapURL('png', { fullMap: true });
  const width = Math.round(g.options.map.graph.width);
  const height = Math.round(g.options.map.graph.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      resolve(null);
    };
    img.onerror = () => reject(new Error('Cannot render the map image'));
    img.src = url;
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Cannot render PNG'))),
      'image/png',
    ),
  );
}
const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
async function saveImage(format, label) {
  if (!framed) throw new Error('Open this map inside Crux Garden to save images.');
  const kind = format === 'svg' ? 'svg' : 'png';
  const name = String(label ?? '').trim() || `${mapName()} (${kind.toUpperCase()})`;
  if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
  await checkForChanges();
  await save();
  show(`Rendering ${kind.toUpperCase()}…`);
  let content;
  if (kind === 'svg') {
    const url = await g.Services.ExportMap.getMapURL('svg', { fullMap: true });
    const svg = await (await fetch(url)).text();
    content = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } else content = await toDataUrl(await renderPng());
  const output = await call({ op: 'save-output', label: name, content }, 5 * 60_000);
  show(`Saved ${name} as an image output.`);
  setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
  return output;
}
const nextMap = () =>
  new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('map:generated', done);
      resolve(null);
    };
    window.addEventListener('map:generated', done);
  });
async function newMap() {
  const settled = nextMap();
  // Upstream's own "New map" control: the debounced regenerate with the current generation options
  const button = document.getElementById('regenerate');
  if (!button) throw new Error('The app has no regenerate control on this page.');
  button.click();
  await settled;
  await checkForChanges();
  await save();
  return inspect();
}
async function command(value) {
  if (hydrating) throw new Error('Wait for the map to open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'save-image')
    return saveImage(String(value.format ?? 'png'), String(value.label ?? ''));
  if (value.op === 'new-map') return newMap();
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a map name up to 200 characters.');
    g.options.map.lore.name = name;
    state.name = name;
    const input = document.getElementById('loreMapName');
    if (input) input.value = name;
    await checkForChanges();
    revision++;
    await save();
    return inspect();
  }
  throw new Error('Unsupported map operation.');
}

function mountBar() {
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span>' +
    '<button type="button" id="save-map">Save map to Garden</button>' +
    '<label>Output name <input id="output-name" maxlength="120" placeholder="Map" /></label>' +
    '<label>Format <select id="image-format"><option value="png">PNG</option><option value="svg">SVG</option></select></label>' +
    '<button type="button" id="save-image">Save image to Cruxspace</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input,#garden-project select{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  bar.querySelector('#save-map').onclick = () =>
    checkForChanges()
      .then(() => {
        revision++;
        return save();
      })
      .catch((e) => show(e.message));
  bar.querySelector('#save-image').onclick = () =>
    saveImage(
      bar.querySelector('#image-format').value,
      bar.querySelector('#output-name').value,
    ).catch((e) => show(e.message));
}
const mapOnScreen = () =>
  new Promise((resolve) => {
    if (g.mapHistory?.length) return resolve(null);
    const poll = setInterval(() => {
      if (g.mapHistory?.length) {
        clearInterval(poll);
        resolve(null);
      }
    }, 300);
  });

async function boot() {
  if (!framed) return;
  mountBar();
  try {
    const loaded = await call({ op: 'read', path: 'project.json' });
    expected = loaded.fingerprint;
    const doc = JSON.parse(loaded.content);
    validateProject(doc);
    show('Opening map…');
    await mapOnScreen(); // upstream boots first (a fresh world); the saved one replaces it
    if (doc.project) {
      state.name = doc.project.name;
      const settled = nextMap();
      const loaded = await call(
        { op: 'native-read', path: doc.project.map.__cruxBinary.path },
        120_000,
      );
      await g.Services.Load.uploadMap(new Blob([loaded.bytes], { type: 'text/plain' }));
      await settled;
    }
    lastMap = await mapData();
    hydrating = false;
    show('Saved to Garden');
    if (!doc.project) {
      revision++;
      save().catch(() => {});
    }
    setInterval(() => {
      if (!document.hidden) void checkForChanges();
    }, WATCH_MS);
  } catch (error) {
    show(error.message);
    console.error('[garden]', error);
  }
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
