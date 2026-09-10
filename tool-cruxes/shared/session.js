// SPDX-License-Identifier: MIT
import { EFFECTS, validateProject, applyCommand } from './model.js';
export const $ = (selector) => document.querySelector(selector);
export function message(error) {
  $('#error').textContent = error ? error.message || String(error) : '';
  $('#error').hidden = !error;
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function button(label, action, parent) {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', () => Promise.resolve().then(action).catch(message));
  parent?.append(el);
  return el;
}
export function labeled(label, input, parent) {
  const el = document.createElement('label');
  el.append(document.createTextNode(label), input);
  parent.append(el);
  return input;
}
export async function openProject(type, render, stop = () => {}) {
  if (window.parent === window) throw new Error('Open this app inside Crux Garden Workshop.');
  let parentOrigin;
  const targetOrigin = () => (parentOrigin && parentOrigin !== 'null' ? parentOrigin : '*');
  const requests = new Map();
  let doc;
  let saved = '';
  let fingerprint = null;
  let timer;
  let failed = false;
  let active = true;
  let tail = Promise.resolve();
  let commands = Promise.resolve();
  const send = (data) =>
    window.parent.postMessage(
      { type: 'crux:app', id: crypto.randomUUID(), ...data },
      targetOrigin(),
    );
  const call = (data) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        requests.delete(id);
        reject(new Error('Garden did not confirm the operation. Your draft is still here.'));
      }, 30000);
      requests.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      window.parent.postMessage({ type: 'crux:app', id, ...data }, targetOrigin());
    });
  const dirty = () => JSON.stringify(doc) !== saved;
  const status = () => {
    $('#save-state').textContent = failed
      ? 'Save needs attention'
      : dirty()
        ? 'Unsaved changes'
        : 'Saved in this Crux';
    send({ op: 'dirty', dirty: dirty() });
  };
  const save = () => {
    clearTimeout(timer);
    const operation = tail.then(async () => {
      if (!active || !doc || !dirty()) return;
      validateProject(doc, type);
      const content = JSON.stringify(doc);
      $('#save-state').textContent = 'Saving…';
      try {
        const result = await call({
          op: 'write',
          path: 'project.json',
          content,
          expected: fingerprint,
        });
        fingerprint = result.fingerprint;
        saved = content;
        failed = false;
        message(null);
        status();
      } catch (e) {
        failed = true;
        status();
        message(e);
        throw e;
      }
    });
    tail = operation.catch(() => {});
    return operation;
  };
  const show = async () => {
    $('#title').value = doc.title;
    await render(structuredClone(doc));
    status();
  };
  const update = async (reducer) => {
    if (!active) throw new Error('This app has closed.');
    const next = structuredClone(doc);
    reducer(next);
    validateProject(next, type);
    doc = next;
    await show();
    clearTimeout(timer);
    if (!failed) timer = setTimeout(() => void save().catch(() => {}), 400);
  };
  const reload = async () => {
    if (doc && dirty() && !confirm('Discard this unsaved draft and load the saved project?'))
      return;
    stop();
    clearTimeout(timer);
    await tail;
    const result = await call({ op: 'read', path: 'project.json' });
    const next = validateProject(JSON.parse(result.content), type);
    doc = next;
    saved = JSON.stringify(doc);
    fingerprint = result.fingerprint;
    failed = false;
    message(null);
    await show();
  };
  const receive = (event) => {
    if (event.source !== window.parent || (parentOrigin && event.origin !== parentOrigin)) return;
    const data = event.data;
    if (data?.type === 'crux:app:result' && requests.has(data.id)) parentOrigin = event.origin;
    if (data?.type === 'crux:app:result') {
      const pending = requests.get(data.id);
      requests.delete(data.id);
      if (data.error) pending?.reject(new Error(data.error));
      else pending?.resolve(data.result);
    } else if (data?.type === 'crux:app:flush') {
      stop();
      void save().then(
        () => send({ op: 'flushed', flushId: data.id }),
        (e) => send({ op: 'flushed', flushId: data.id, error: e.message }),
      );
    } else if (data?.type === 'crux:app:command') {
      const run = commands.then(async () => {
        if (!doc) throw new Error('The app is still loading.');
        if (data.command?.op === 'inspect')
          return {
            project:
              doc.type === 'tables'
                ? { ...doc, rows: doc.rows.slice(0, 50) }
                : structuredClone(doc),
            rowCount: doc.rows?.length,
            ...(type === 'openmosh' ? { availableEffects: EFFECTS } : {}),
            saved: !dirty(),
            fingerprint,
          };
        await save();
        const next = applyCommand(doc, data.command);
        stop();
        await update((d) => {
          Object.assign(d, next);
        });
        await save();
        return {
          saved: true,
          fingerprint,
          project:
            doc.type === 'tables' ? { ...doc, rows: doc.rows.slice(0, 50) } : structuredClone(doc),
        };
      });
      commands = run.catch(() => {});
      void run.then(
        (result) => send({ op: 'tool-result', commandId: data.id, result }),
        (e) => send({ op: 'tool-result', commandId: data.id, error: e.message }),
      );
    }
  };
  window.addEventListener('message', receive);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  window.addEventListener('pagehide', () => {
    active = false;
    stop();
    clearTimeout(timer);
    window.removeEventListener('message', receive);
    for (const r of requests.values()) r.reject(new Error('App closed.'));
  });
  $('#save').onclick = () => void save().catch(message);
  $('#reload').onclick = () => void reload().catch(message);
  $('#title').onchange = (e) =>
    void update((d) => {
      d.title = e.target.value;
    }).catch(message);
  const session = {
    get doc() {
      return structuredClone(doc);
    },
    update,
    save,
    reload,
    call,
    async importImage(file) {
      if (
        !file ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
        file.size > 4_000_000
      )
        throw new Error('Choose a PNG, JPEG, WebP or GIF up to 4 MB.');
      const bytes = await file.arrayBuffer();
      const bitmap = await createImageBitmap(file);
      const pixels = bitmap.width * bitmap.height;
      bitmap.close();
      if (pixels > 16_000_000) throw new Error('Use an image up to 16 megapixels.');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      const ext = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
      }[file.type];
      const path = `assets/${digest}.${ext}`;
      let existing = null;
      try {
        existing = await call({ op: 'read', path });
      } catch (e) {
        if (!e.message.includes('no longer exists')) throw e;
      }
      if (!existing) {
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        await call({ op: 'write', path, content, expected: null });
      }
      return path;
    },
  };
  await reload();
  return session;
}

window.addEventListener('error', (event) => message(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => message(event.reason));
