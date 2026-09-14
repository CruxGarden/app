// Garden bridge for the Model Crux (Crux Garden): a plain module next to the
// unmodified JSCAD bundle. Inside a Workshop frame it opens the editor, loads
// the saved source (or the starter model.js) into JSCAD's own editor and
// evaluates it, saves the source after every editor change, flushes before a
// close, and turns the app's own exports (STL, 3MF, OBJ, SVG…) into outputs of
// the Crux instead of downloads. App Tools drive the same operations. On a
// shared page it only loads the model; downloads stay downloads.
import { validateProject } from './document.js';

const framed = window.parent !== window;
// Upstream resolves its examples against the page's directory (openjscad.xyz serves
// the app at /); a Crux serves index.html by name, so the address loses the file name.
if (/\/index\.html$/.test(location.pathname))
  history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash);
let origin;
let expected = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer;
let status = null;
let cm = null;
let tail = Promise.resolve();
let commandTail = Promise.resolve();
const pending = new Map();
const state = { name: 'Model' };
let exportWaiter = null;

const MIME = {
  stl: 'model/stl',
  '3mf': 'model/3mf',
  obj: 'model/obj',
  amf: 'application/amf+xml',
  x3d: 'model/x3d+xml',
  svg: 'image/svg+xml',
  dxf: 'application/dxf',
};

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
      reject(new Error('Garden did not confirm the save. Your model is still open.'));
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, timeoutMs, every = 100) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await sleep(every);
  }
  return null;
};

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

// Upstream's exports go through file-saver: a detached anchor with a blob: URL and a
// download name, clicked. Inside a Workshop that click becomes an output of the Crux.
const nativeDispatch = HTMLAnchorElement.prototype.dispatchEvent;
HTMLAnchorElement.prototype.dispatchEvent = function (event) {
  if (framed && event?.type === 'click' && this.download && String(this.href).startsWith('blob:')) {
    captureExport(this.href, this.download).catch((e) => show(e.message));
    return true;
  }
  return nativeDispatch.call(this, event);
};
async function captureExport(href, fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeType = MIME[ext];
  const waiter = exportWaiter;
  exportWaiter = null;
  try {
    if (!mimeType) throw new Error(`JSCAD's ${ext.toUpperCase()} export is not an output type here.`);
    const bytes = await (await fetch(href)).arrayBuffer();
    const label = waiter?.label || fileName.replace(/\.[^.]+$/, '') || state.name;
    const output = await call({ op: 'save-output', label, bytes, mimeType }, 5 * 60_000);
    show(`Saved ${label} as a ${ext.toUpperCase()} output.`);
    setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
    waiter?.resolve(output);
  } catch (error) {
    waiter?.reject(error);
    throw error;
  }
}

const source = () => (cm ? cm.getValue() : '');
const modelName = () => state.name;
const errorText = () => (document.querySelector('#errormessage')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const busyText = () => (document.querySelector('#busy')?.textContent ?? '').trim();
// JSCAD names binary and ASCII STL separately; here stl means binary
const jscadFormatName = (format) => (format === 'stl' ? 'stlb' : format);
const formats = () =>
  Array.from(
    new Set(
      Array.from(document.querySelectorAll('#exportFormats option')).map((o) =>
        o.value === 'stla' || o.value === 'stlb' ? 'stl' : o.value,
      ),
    ),
  ).filter((f) => MIME[f]);

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
    if (hydrating) throw new Error('Wait for the saved model to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving model…');
      const doc = {
        version: 1,
        app: 'jscad',
        project: { name: modelName(), source: source(), saved: new Date().toISOString() },
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

// JSCAD's editor is upstream's CodeMirror behind the Editor tool; the compile key
// (shift + enter by default) hands the text to the app as its design.
async function openEditor() {
  const toggle = await until(() => document.querySelector('#toggleEditor'), 30_000);
  if (!toggle) throw new Error('JSCAD did not start.');
  if (!document.querySelector('#jscad .CodeMirror')) toggle.click();
  const el = await until(() => document.querySelector('#jscad .CodeMirror'), 10_000);
  if (!el || !el.CodeMirror) throw new Error('JSCAD’s editor did not open.');
  cm = el.CodeMirror;
  return cm;
}
function evaluate() {
  const keys = cm.getOption('extraKeys') || {};
  const compile = keys['Shift-Enter'] || Object.entries(keys).find(([k]) => k !== 'Tab')?.[1];
  if (!compile) throw new Error('The editor has no compile key yet.');
  compile(cm);
}
async function awaitEvaluation() {
  await until(() => busyText(), 1500, 50);
  await until(() => !busyText(), 90_000, 100);
  await sleep(150);
  return errorText();
}
async function loadSource(text) {
  cm.setValue(text);
  cm.setCursor(0, 0);
  evaluate();
  return awaitEvaluation();
}

function inspect() {
  const text = source();
  return {
    name: modelName(),
    sourceLength: text.length,
    source: text.slice(0, 4000),
    error: errorText() || null,
    busy: !!busyText(),
    formats: formats(),
  };
}
async function saveModel(format, label) {
  if (!framed) throw new Error('Open this model inside Crux Garden to save outputs.');
  const wanted = String(format || 'stl').toLowerCase();
  if (!MIME[wanted]) throw new Error('Choose stl, 3mf, obj, amf, x3d, svg or dxf.');
  const name = String(label ?? '').trim() || `${modelName()} (${wanted.toUpperCase()})`;
  if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
  await save();
  if (busyText()) await awaitEvaluation();
  const error = errorText();
  if (error) throw new Error(`Fix the model first: ${error}`);
  const select = document.querySelector('#exportFormats');
  const available = formats();
  if (!select || !available.includes(wanted))
    throw new Error(
      available.length
        ? `This model exports as ${available.join(', ')}; ${wanted} is not available for it.`
        : 'The model has nothing to export yet.',
    );
  select.value = jscadFormatName(wanted);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(150);
  show(`Exporting ${wanted.toUpperCase()}…`);
  const output = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      exportWaiter = null;
      reject(new Error('JSCAD did not produce the export.'));
    }, 5 * 60_000);
    exportWaiter = {
      label: name,
      resolve: (v) => {
        clearTimeout(timeout);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timeout);
        reject(e);
      },
    };
    document.querySelector('#exportBtn')?.click();
  });
  return output;
}
async function command(value) {
  if (hydrating) throw new Error('Wait for the model to open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'save-model') return saveModel(value.format, value.label);
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a model name up to 200 characters.');
    state.name = name;
    const input = document.querySelector('#model-name');
    if (input) input.value = name;
    revision++;
    await save();
    return inspect();
  }
  if (value.op === 'set-source') {
    const text = String(value.source ?? '');
    if (!text.trim() || text.length > 400_000) throw new Error('Give the whole model source (up to 400 000 characters).');
    const error = await loadSource(text);
    revision++;
    await save();
    return { ...inspect(), error: error || null };
  }
  throw new Error('Unsupported model operation.');
}

function mountBar() {
  document.body.classList.add('garden');
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span>' +
    '<label>Name <input id="model-name" maxlength="200" placeholder="Model" /></label>' +
    '<label>Output <input id="output-name" maxlength="120" placeholder="Model" /></label>' +
    '<label>Format <select id="output-format"><option value="stl">STL</option><option value="3mf">3MF</option><option value="obj">OBJ</option><option value="svg">SVG</option><option value="dxf">DXF</option></select></label>' +
    '<button type="button" id="save-model">Save model to Cruxspace</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;white-space:nowrap;box-sizing:border-box;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1;overflow:hidden;text-overflow:ellipsis}#garden-project input{width:9em}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input,#garden-project select{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  bar.querySelector('#model-name').oninput = (e) => {
    const name = e.target.value.trim();
    if (name) {
      state.name = name.slice(0, 200);
      dirty();
    }
  };
  bar.querySelector('#save-model').onclick = () =>
    saveModel(bar.querySelector('#output-format').value, bar.querySelector('#output-name').value).catch((e) =>
      show(e.message),
    );
}

async function boot() {
  let doc = null;
  try {
    if (framed) {
      mountBar();
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      doc = JSON.parse(loaded.content);
    } else {
      const response = await fetch('data/project.json');
      doc = response.ok ? await response.json() : { version: 1, app: 'jscad', project: null };
    }
    validateProject(doc);
    show('Opening model…');
    await openEditor();
    // upstream opens its first example right after boot; the saved model replaces it once it is in
    await until(() => source().trim().length > 0, 20_000);
    let text = doc.project?.source;
    if (!text) text = await (await fetch('model.js')).text();
    if (doc.project) state.name = doc.project.name;
    const input = document.querySelector('#model-name');
    if (input) input.value = state.name;
    const error = await loadSource(text);
    hydrating = false;
    if (framed) {
      cm.on('change', () => dirty());
      show(error ? `Saved to Garden · ${error}` : 'Saved to Garden');
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
