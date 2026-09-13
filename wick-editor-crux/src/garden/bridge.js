/*
 * Garden bridge for Wick Editor (Crux Garden). The editor is untouched: the
 * project's own .wick file (what "Save" downloads) is the Garden document,
 * stored as a binary Artifact and referenced from data/project.json. On boot
 * the saved file is opened the way a dropped .wick file is; every change the
 * editor records (its own autosave request) marks the project dirty, and a
 * confirmed save writes a fresh .wick file through the host.
 */
const embedded = window.parent !== window;
let origin;
let expected = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer;
let tail = Promise.resolve();
let commandTail = Promise.resolve();
let editor = null;
let status = null;
const pending = new Map();

const show = (text) => {
  if (status) status.textContent = text;
};
const send = (value) =>
  window.parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*');
const call = (value) =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not confirm the save. Your draft is still open.'));
    }, 120000);
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
  timer = setTimeout(() => save().catch(() => {}), 2000);
}
/** The project as its own .wick file (zip), through the engine's exporter. */
function wickFile(project) {
  return new Promise((resolve, reject) => {
    try {
      window.Wick.WickFile.toWickFile(project, (file) => (file ? resolve(file) : reject(new Error('Wick could not package the project.'))));
    } catch (error) {
      reject(error);
    }
  });
}
function save() {
  const operation = tail.then(async () => {
    clearTimeout(timer);
    if (hydrating) throw new Error('Wait for the saved project to finish opening.');
    if (revision === saved) return;
    if (!editor || !editor.project) throw new Error('The editor is not running.');
    if (editor.state && editor.state.previewPlaying) throw new Error('Stop the preview before saving.');
    const saving = revision;
    try {
      show('Saving project…');
      const project = editor.project;
      const file = await wickFile(project);
      const bytes = await file.arrayBuffer();
      const imported = await call({ op: 'native-import', bytes, mimeType: 'application/zip' });
      const doc = {
        version: 1,
        app: 'wick-editor',
        project: {
          file: { __cruxBinary: { path: imported.path, kind: 'buffer', type: 'application/zip', size: bytes.byteLength } },
          name: String(project.name || ''),
          framerate: project.framerate,
          width: project.width,
          height: project.height,
          saved: new Date().toISOString(),
        },
      };
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
  const p = editor.project;
  const assets = p.getAssets ? p.getAssets() : [];
  return {
    name: String(p.name || ''),
    framerate: p.framerate,
    width: p.width,
    height: p.height,
    backgroundColor: String(p.backgroundColor || ''),
    frames: p.root ? p.root.timeline.length : null,
    layers: p.root ? p.root.timeline.layers.length : null,
    assets: assets.map((a) => ({ name: a.name, type: a.classname })),
  };
}
async function command(value) {
  if (hydrating) throw new Error('Wait for the project to open.');
  if (!editor || !editor.project) throw new Error('The editor is not running.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'set-name') {
    const name = String(value.name == null ? '' : value.name);
    if (!name.trim() || name.length > 200) throw new Error('Use a project name up to 200 characters.');
    editor.project.name = name.trim();
    editor.projectDidChange({ actionName: 'Rename Project' });
  } else if (value.op === 'set-framerate') {
    const fps = Number(value.framerate);
    if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error('Choose a whole frame rate from 1 to 120.');
    editor.project.framerate = fps;
    editor.projectDidChange({ actionName: 'Change Framerate' });
  } else throw new Error('Unsupported Wick Editor operation.');
  dirty();
  await save();
  return inspect();
}

/** Called from Editor.componentDidMount. Resolves true when a Crux owns the project. */
export function gardenBoot(instance) {
  if (!embedded) return Promise.resolve(false);
  editor = instance;
  window.gardenEditor = instance; // for the desktop tests
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML = '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#root{height:calc(100% - 32px)!important}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return;
    origin = event.origin;
    if (message.type === 'crux:app:result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request && request.reject(new Error(message.error));
      else request && request.resolve(message.result);
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
        (result) => {
          try {
            send({ op: 'tool-result', commandId: message.id, result: JSON.parse(JSON.stringify(result)) });
          } catch (error) {
            send({ op: 'tool-result', commandId: message.id, error: error.message });
          }
        },
        (error) => send({ op: 'tool-result', commandId: message.id, error: error.message }),
      );
    }
  });
  const buttons = bar.querySelectorAll('button');
  buttons[0].onclick = () => {
    dirty();
    save().catch(() => {});
  };
  buttons[1].onclick = () => {
    if (revision === saved || window.confirm('Discard the unsaved draft and reload the saved project?')) window.location.reload();
  };
  return (async () => {
    const loaded = await call({ op: 'read', path: 'project.json' });
    expected = loaded.fingerprint;
    const doc = JSON.parse(loaded.content);
    if (!doc || doc.version !== 1 || doc.app !== 'wick-editor') throw new Error('Invalid Wick Editor project.');
    if (doc.project && doc.project.file) {
      const asset = await call({ op: 'native-read', path: doc.project.file.__cruxBinary.path });
      const blob = new Blob([asset.bytes], { type: 'application/zip' });
      await new Promise((resolve, reject) => {
        window.Wick.WickFile.fromWickFile(blob, (project) => (project ? (editor.setupNewProject(project), resolve()) : reject(new Error('Could not open the saved Wick project.'))), 'blob');
      });
    }
    // Every recorded change asks the editor for an autosave; that is the change signal.
    const requestAutosave = editor.requestAutosave;
    editor.requestAutosave = (...args) => {
      dirty();
      return requestAutosave.apply(editor, args);
    };
    hydrating = false;
    show('Saved to Garden');
    if (!doc.project) dirty(); // the first save records the fresh project
    return true;
  })().catch((error) => {
    show(error.message);
    throw error;
  });
}
