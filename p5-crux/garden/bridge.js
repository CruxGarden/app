// Garden bridge for the sketch tool (Crux Garden): data/project.json holds the
// name and the seed; the sketch (sketch.js) is loaded once the seed is known
// and reads it from window.garden; a frame of the canvas can go to the Crux's
// outputs; App Tools drive the same operations. Standalone, the bridge is a
// stand-in: a random seed, no saving.
import { validateProject } from './document.js';

const $ = (id) => document.getElementById(id);
const framed = parent !== window;
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
const state = {
  name: 'Sketch',
  seed: Math.floor(Math.random() * 1e6),
  frames: 0,
  paused: false,
  started: false,
};
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
      reject(new Error('Garden did not confirm the save. Your sketch is still running.'));
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

const info = () => {
  const canvas = document.querySelector('#stage canvas');
  $('sketch-info').textContent = canvas
    ? `${canvas.width}×${canvas.height} · ${state.frames} frames${state.paused ? ' · paused' : ''}`
    : 'Starting…';
};
function startSketch() {
  const old = document.getElementById('sketch-source');
  if (old) old.remove();
  const stage = $('stage');
  stage.innerHTML = '';
  if (window.remove) window.remove();
  state.frames = 0;
  state.started = true;
  const script = document.createElement('script');
  script.id = 'sketch-source';
  script.src = `sketch.js?seed=${state.seed}&t=${Date.now()}`;
  // p5 only starts itself on page load; a sketch loaded later is started here (global mode).
  script.onload = () => {
    if (window.p5) new window.p5();
    info();
  };
  script.onerror = () => show('sketch.js did not load.');
  document.body.append(script);
  info();
}
function pause(on) {
  state.paused = on;
  if (on && window.noLoop) window.noLoop();
  if (!on && window.loop) window.loop();
  $('sketch-pause').setAttribute('aria-pressed', String(on));
  info();
}

window.garden = {
  get seed() {
    return state.seed;
  },
  get name() {
    return state.name;
  },
  frame(n) {
    state.frames = n;
    if (n % 30 === 0) info();
  },
  saveFrame(label) {
    return saveFrame(label ?? '').catch((e) => show(e.message));
  },
};

function dirty() {
  if (hydrating) return;
  revision++;
  if (!framed) return;
  send({ op: 'dirty', dirty: true });
  show('Unsaved changes');
  clearTimeout(timer);
  timer = setTimeout(() => save().catch(() => {}), 1200);
}
function save() {
  const operation = tail.then(async () => {
    clearTimeout(timer);
    if (!framed) return;
    if (hydrating) throw new Error('Wait for the saved sketch to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving sketch…');
      const doc = {
        version: 1,
        app: 'p5',
        project: { name: state.name, seed: state.seed, saved: new Date().toISOString() },
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
  const canvas = document.querySelector('#stage canvas');
  const source = document.getElementById('sketch-source');
  return {
    name: state.name,
    seed: state.seed,
    canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    frames: state.frames,
    running: state.started && !state.paused,
    paused: state.paused,
    source: source ? 'sketch.js' : null,
  };
}
async function saveFrame(label) {
  if (!framed) throw new Error('Open this sketch inside Crux Garden to save frames.');
  const canvas = document.querySelector('#stage canvas');
  if (!canvas) throw new Error('The sketch has no canvas yet.');
  const name = String(label ?? '').trim() || `${state.name} frame ${state.frames}`;
  if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
  await save();
  show('Saving frame…');
  const output = await call({
    op: 'save-output',
    label: name,
    content: canvas.toDataURL('image/png'),
  });
  show(`Saved ${name} as an image output.`);
  setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
  return output;
}
const seedOf = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 999999999)
    throw new Error('Use a whole-number seed from 0 to 999999999.');
  return n;
};
async function command(value) {
  if (hydrating) throw new Error('Wait for the sketch to open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'save-frame') return saveFrame(String(value.label ?? ''));
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a sketch name up to 200 characters.');
    state.name = name;
    $('sketch-name').value = name;
    dirty();
  } else if (value.op === 'set-seed') {
    state.seed = seedOf(value.seed);
    $('sketch-seed').value = String(state.seed);
    dirty();
    startSketch();
  } else if (value.op === 'restart') startSketch();
  else if (value.op === 'pause') pause(true);
  else if (value.op === 'resume') pause(false);
  else throw new Error('Unsupported sketch operation.');
  await save();
  return inspect();
}
window.addEventListener('message', (event) => {
  if (event.source !== parent || (origin !== undefined && event.origin !== origin)) return;
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

function wireHeader() {
  $('sketch-name').oninput = () => {
    state.name = $('sketch-name').value.trim() || 'Sketch';
    dirty();
  };
  $('sketch-seed').onchange = () => {
    try {
      state.seed = seedOf($('sketch-seed').value);
      dirty();
      startSketch();
    } catch (e) {
      show(e.message);
    }
  };
  $('sketch-restart').onclick = () => startSketch();
  $('sketch-pause').onclick = () => pause(!state.paused);
}
async function boot() {
  wireHeader();
  if (framed) {
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML =
      '<span role="status">Opening Garden project…</span>' +
      '<label>Output name <input id="output-name" maxlength="120" placeholder="Frame" /></label>' +
      '<button type="button" id="save-frame">Save frame to Cruxspace</button>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}body{padding-bottom:34px;box-sizing:border-box}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    bar.querySelector('#save-frame').onclick = () =>
      saveFrame(bar.querySelector('#output-name').value).catch((e) => show(e.message));
    try {
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      if (doc.project) {
        state.name = doc.project.name;
        state.seed = doc.project.seed;
      }
      $('sketch-name').value = state.name;
      $('sketch-seed').value = String(state.seed);
      hydrating = false;
      show('Saved to Garden');
      if (!doc.project) {
        revision++;
        save().catch(() => {});
      }
    } catch (error) {
      show(error.message);
      throw error;
    }
  } else {
    $('sketch-name').value = state.name;
    $('sketch-seed').value = String(state.seed);
    hydrating = false;
  }
  startSketch();
}
void boot();
