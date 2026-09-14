// Garden bridge for the Notation tool (Crux Garden): data/project.json holds the
// score's name and ABC text; abcjs's editor renders and plays it live; every
// change marks the project dirty and a confirmed save writes it; a rendered
// score (SVG or PNG) can go to the Crux's outputs; App Tools drive the same
// operations. Standalone (a shared page), the bridge fetches data/project.json
// and shows the score with playback, saving nothing.
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
const state = { name: 'Score', abc: '' };
let editor = null;
const show = (text) => {
  if (status) status.textContent = text;
};
const send = (value) =>
  parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*');
const call = (value, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not confirm the save. Your score is still open.'));
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

const tunebook = () => editor?.tunes ?? [];
function summary() {
  const tunes = tunebook();
  const first = tunes[0];
  const meta = first?.metaText ?? {};
  const warnings = editor?.warnings ?? [];
  return {
    tunes: tunes.length,
    title: meta.title ?? '',
    composer: meta.composer ?? '',
    key: first?.getKeySignature?.()?.root ? `${first.getKeySignature().root}${first.getKeySignature().acc ?? ''} ${first.getKeySignature().mode ?? ''}`.trim() : '',
    meter: first?.getMeterFraction ? `${first.getMeterFraction().num}/${first.getMeterFraction().den}` : '',
    tempo: first?.metaText?.tempo?.bpm ?? first?.getBpm?.() ?? null,
    warnings: warnings.length,
  };
}
function info() {
  const s = summary();
  $('score-info').textContent =
    `${state.abc.length} chars · ${s.tunes} tune${s.tunes === 1 ? '' : 's'}${s.key ? ` · ${s.key}` : ''}${s.meter ? ` · ${s.meter}` : ''}${s.warnings ? ` · ${s.warnings} warning${s.warnings === 1 ? '' : 's'}` : ''}`;
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
    if (hydrating) throw new Error('Wait for the saved score to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving score…');
      const doc = { version: 1, app: 'abc', project: { name: state.name, abc: state.abc, saved: new Date().toISOString() } };
      validateProject(doc);
      const result = await call({ op: 'write', path: 'project.json', expected, content: JSON.stringify(doc) });
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
  return { name: state.name, chars: state.abc.length, ...summary(), abc: state.abc.slice(0, 4000) };
}
function setAbc(abc) {
  state.abc = abc;
  const area = $('abc');
  if (area.value !== abc) {
    area.value = abc;
    editor?.fireChanged?.();
    if (!editor?.fireChanged) area.dispatchEvent(new Event('change'));
  }
  info();
}
const renderedSvg = () => {
  const svg = $('paper').querySelector('svg');
  if (!svg) throw new Error('Nothing is rendered yet.');
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
};
async function svgToPng(svgText) {
  const svg = $('paper').querySelector('svg');
  const width = Math.ceil(svg.viewBox?.baseVal?.width || svg.clientWidth || 800);
  const height = Math.ceil(svg.viewBox?.baseVal?.height || svg.clientHeight || 600);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(null);
      };
      img.onerror = () => reject(new Error('Cannot rasterise the score'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  return canvas.toDataURL('image/png');
}
async function saveImage(format, label) {
  if (!framed) throw new Error('Open this score inside Crux Garden to save images.');
  const kind = format === 'png' ? 'png' : 'svg';
  const name = String(label ?? '').trim() || `${state.name} (${kind.toUpperCase()})`;
  if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
  await save();
  show(`Rendering ${kind.toUpperCase()}…`);
  const svgText = renderedSvg();
  const content = kind === 'svg' ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}` : await svgToPng(svgText);
  const output = await call({ op: 'save-output', label: name, content }, 120000);
  show(`Saved ${name} as an image output.`);
  setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
  return output;
}
async function command(value) {
  if (hydrating) throw new Error('Wait for the score to open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'save-image') return saveImage(String(value.format ?? 'svg'), String(value.label ?? ''));
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a score name up to 200 characters.');
    state.name = name;
    $('score-name').value = name;
    dirty();
  } else if (value.op === 'set-abc') {
    const abc = String(value.abc ?? '');
    if (!abc.trim() || abc.length > 200000) throw new Error('Give ABC text up to 200 000 characters.');
    if (!/^\s*X:/m.test(abc)) throw new Error('ABC text needs an X: header line.');
    setAbc(abc);
    dirty();
  } else throw new Error('Unsupported notation operation.');
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
  $('abc').value = state.abc;
  editor = new window.ABCJS.Editor('abc', {
    paper_id: 'paper',
    warnings_id: 'warnings',
    abcjsParams: { responsive: 'resize', add_classes: true },
    synth: {
      el: '#audio',
      options: { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true },
      // The piano soundfont travels with the Crux (runtime/soundfont/), so playback works offline
      audioParams: { soundFontUrl: new URL('runtime/soundfont/', document.baseURI).href },
    },
    onchange: () => {
      const next = $('abc').value;
      if (next === state.abc) return;
      state.abc = next;
      info();
      dirty();
    },
  });
  $('score-name').value = state.name;
  $('score-name').oninput = () => {
    state.name = $('score-name').value.trim() || 'Score';
    dirty();
  };
  info();
  setTimeout(info, 800);
}
async function boot() {
  const starter = await fetch('tune.abc').then(
    (r) => (r.ok ? r.text() : 'X:1\nT:New score\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |'),
    () => 'X:1\nT:New score\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |',
  );
  if (framed) {
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML =
      '<span role="status">Opening Garden project…</span>' +
      '<label>Output name <input id="output-name" maxlength="120" placeholder="Score" /></label>' +
      '<label>Format <select id="image-format"><option value="svg">SVG</option><option value="png">PNG</option></select></label>' +
      '<button type="button" id="save-image">Save score to Cruxspace</button>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input,#garden-project select{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}#score{height:calc(100% - 80px)!important}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    bar.querySelector('#save-image').onclick = () =>
      saveImage(bar.querySelector('#image-format').value, bar.querySelector('#output-name').value).catch((e) => show(e.message));
    try {
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      if (doc.project) {
        state.name = doc.project.name;
        state.abc = doc.project.abc;
      } else state.abc = starter;
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
    try {
      const doc = await fetch('data/project.json').then((r) => (r.ok ? r.json() : null));
      if (doc && doc.project) {
        state.name = doc.project.name;
        state.abc = doc.project.abc;
      } else state.abc = starter;
    } catch {
      state.abc = starter;
    }
    document.title = state.name;
    mountEditor();
    hydrating = false;
  }
}
void boot();
