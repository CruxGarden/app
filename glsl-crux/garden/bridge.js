// Garden bridge for the shader tool (Crux Garden): data/project.json holds the
// name and the fragment shader source; the editor (glslEditor) shows and
// compiles it live; every change marks the project dirty and a confirmed save
// writes it; a frame of the shader canvas can go to the Crux's outputs; App
// Tools drive the same operations. Standalone (a shared page), the bridge
// fetches data/project.json and saves nothing.
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
const state = { name: 'Shader', source: '' };
let ge = null;
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
      reject(new Error('Garden did not confirm the save. Your shader is still open.'));
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

const canvas = () => (ge && ge.shader ? ge.shader.elCanvas : null);
const compiles = () => {
  const c = ge && ge.shader && ge.shader.canvas;
  return c ? !(c.isValid === false) : false;
};
const uniforms = (source) => [
  ...new Set([...source.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1])),
];
function info() {
  const c = canvas();
  const n = state.source.length;
  $('shader-info').textContent =
    `${n} chars · ${c ? `${c.width}×${c.height}` : 'no canvas'}${compiles() ? '' : ' · does not compile'}`;
}
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
    if (hydrating) throw new Error('Wait for the saved shader to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving shader…');
      const doc = {
        version: 1,
        app: 'glsl',
        project: { name: state.name, source: state.source, saved: new Date().toISOString() },
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
  const c = canvas();
  return {
    name: state.name,
    sourceLength: state.source.length,
    lines: state.source.split('\n').length,
    uniforms: uniforms(state.source),
    canvas: c ? { width: c.width, height: c.height } : null,
    compiles: compiles(),
  };
}
async function saveFrame(label) {
  if (!framed) throw new Error('Open this shader inside Crux Garden to save frames.');
  const c = canvas();
  if (!c) throw new Error('The shader has no canvas yet.');
  const name = String(label ?? '').trim() || state.name;
  if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
  await save();
  show('Saving frame…');
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const output = await call({ op: 'save-output', label: name, content: c.toDataURL('image/png') });
  show(`Saved ${name} as an image output.`);
  setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
  return output;
}
function setSource(source) {
  state.source = source;
  if (ge && ge.getContent() !== source) ge.setContent(source);
  info();
}
async function command(value) {
  if (hydrating) throw new Error('Wait for the shader to open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'save-frame') return saveFrame(String(value.label ?? ''));
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a shader name up to 200 characters.');
    state.name = name;
    $('shader-name').value = name;
    dirty();
  } else if (value.op === 'set-source') {
    const source = String(value.source ?? '');
    if (!source.trim() || source.length > 200000)
      throw new Error('Give the whole fragment shader (up to 200 000 characters).');
    if (!/void\s+main\s*\(/.test(source))
      throw new Error('A fragment shader needs a main() function.');
    setSource(source);
    dirty();
  } else throw new Error('Unsupported shader operation.');
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

function mountEditor() {
  ge = new window.GlslEditor('#glsl_editor', {
    canvas_size: 320,
    canvas_draggable: true,
    theme: 'monokai',
    multipleBuffers: false,
    watchHash: false,
    fileDrops: false,
    menu: false,
    exportIcon: false,
  });
  ge.setContent(state.source, 'shader.frag');
  ge.editor.on('change', () => {
    const next = ge.getContent();
    if (next === state.source) return;
    state.source = next;
    info();
    dirty();
  });
  $('shader-name').value = state.name;
  $('shader-name').oninput = () => {
    state.name = $('shader-name').value.trim() || 'Shader';
    dirty();
  };
  info();
  setTimeout(info, 1500);
}
async function boot() {
  const starter = await fetch('shader.frag').then(
    (r) => (r.ok ? r.text() : ''),
    () => '',
  );
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
        state.source = doc.project.source;
      } else state.source = starter;
      mountEditor();
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
    // A shared page: the saved shader, live and editable, nothing saved.
    try {
      const doc = await fetch('data/project.json').then((r) => (r.ok ? r.json() : null));
      if (doc && doc.project) {
        state.name = doc.project.name;
        state.source = doc.project.source;
      } else state.source = starter;
    } catch {
      state.source = starter;
    }
    document.title = state.name;
    mountEditor();
    hydrating = false;
  }
}
void boot();
