// Garden bridge for the AM-1 Arpeggio Machine (Crux Garden). The instrument is
// untouched: it keeps its session in four localStorage keys (the active patch,
// the circuit era, the saved-patch bank, the manual flag). Before the
// instrument loads, the saved session goes into those keys; every write the
// instrument makes to them marks the project dirty and a confirmed save writes
// them to data/project.json. The files it would download (a recorded .wav, an
// exported patch) are kept in the Crux as binary Artifacts instead.
/* global state, ctx, serializePatch, applyPatch, persistSession, readBank, KEYS, SCALES */
(function () {
  const embedded = parent !== window;
  const STORE = {
    active: 'am1.active',
    era: 'am1.era',
    patches: 'am1.patches',
    manual: 'am1.manual',
  };
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const validateProject = (doc) => {
    if (
      !object(doc) ||
      doc.version !== 1 ||
      doc.app !== 'am-1' ||
      Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
    )
      throw Error('Invalid AM-1 project.');
    if (doc.project === null) return;
    const p = doc.project;
    if (
      !object(p) ||
      Object.keys(p).some(
        (k) => !['active', 'era', 'manual', 'patches', 'files', 'saved'].includes(k),
      )
    )
      throw Error('Invalid AM-1 session.');
    if (
      p.active !== null &&
      (!object(p.active) || typeof p.active.n !== 'string' || !object(p.active.p))
    )
      throw Error('Invalid active patch.');
    if (p.era !== null && p.era !== 'mk1' && p.era !== 'mk2') throw Error('Invalid circuit era.');
    if (typeof p.manual !== 'boolean') throw Error('Invalid manual flag.');
    if (
      !object(p.patches) ||
      Object.keys(p.patches).length > 1000 ||
      Object.values(p.patches).some((v) => !object(v))
    )
      throw Error('Invalid patch bank.');
    if (!Array.isArray(p.files) || p.files.length > 1000) throw Error('Invalid file list.');
    for (const f of p.files) {
      const ref = object(f) && object(f.file) && f.file.__cruxBinary;
      if (
        !ref ||
        typeof f.name !== 'string' ||
        !f.name ||
        f.name.length > 200 ||
        !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
        ref.size !== f.size ||
        typeof f.type !== 'string' ||
        typeof f.created !== 'string'
      )
        throw Error('Invalid file reference.');
    }
    if (JSON.stringify(p).length > 3_000_000) throw Error('The AM-1 session is too large.');
  };
  let origin,
    expected = null,
    revision = 0,
    saved = 0,
    hydrating = true,
    timer,
    status = null;
  let files = [];
  let tail = Promise.resolve(),
    commandTail = Promise.resolve();
  const pending = new Map();
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
        reject(new Error('Garden did not confirm the save. Your session is still open.'));
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
  const parse = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  };
  /** The session as the instrument keeps it, read back from its own keys. */
  function capture() {
    const active = parse(STORE.active);
    const era = localStorage.getItem(STORE.era);
    return {
      version: 1,
      app: 'am-1',
      project: {
        active:
          active && object(active) && typeof active.n === 'string' && object(active.p)
            ? active
            : null,
        era: era === 'mk1' || era === 'mk2' ? era : null,
        manual: localStorage.getItem(STORE.manual) === '1',
        patches: parse(STORE.patches) || {},
        files,
        saved: new Date().toISOString(),
      },
    };
  }
  function dirty() {
    if (hydrating) return;
    revision++;
    send({ op: 'dirty', dirty: true });
    show('Unsaved changes');
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(() => {}), 1200);
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      if (hydrating) throw new Error('Wait for the saved session to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving session…');
        const doc = capture();
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
  /** A file the instrument would download (a bounce, an exported patch) is kept in the Crux. */
  async function keep(blob, name) {
    const type = blob.type || (/\.wav$/i.test(name) ? 'audio/wav' : 'application/octet-stream');
    show(`Saving ${name} to Garden…`);
    const bytes = await blob.arrayBuffer();
    const imported = await call({ op: 'native-import', bytes, mimeType: type });
    files = [
      ...files,
      {
        name: name.slice(0, 200),
        type,
        size: bytes.byteLength,
        created: new Date().toISOString(),
        file: {
          __cruxBinary: { path: imported.path, kind: 'buffer', type, size: bytes.byteLength },
        },
      },
    ];
    dirty();
    await save();
  }
  /* The instrument's tables and functions are globals of its classic script (state, KEYS, SCALES,
     serializePatch, applyPatch, persistSession, readBank, ctx); they exist once it has loaded. */
  function inspect() {
    const patch = serializePatch();
    return JSON.parse(
      JSON.stringify({
        patch: document.getElementById('patchName').value,
        key: KEYS[state.key],
        scale: state.scale,
        tempo: state.tempo,
        circuit: state.circuit,
        running: !!ctx && document.getElementById('btnRun').getAttribute('aria-pressed') === 'true',
        parts: patch.layers,
        savedPatches: Object.keys(readBank()).sort(),
        files: files.map((f) => f.name),
      }),
    );
  }
  async function command(value) {
    if (hydrating) throw new Error('Wait for the session to open.');
    if (value.op === 'inspect') return inspect();
    if (value.op === 'set-tempo') {
      const tempo = Number(value.tempo);
      if (!Number.isInteger(tempo) || tempo < 5 || tempo > 180)
        throw new Error('Choose a tempo from 5 to 180.');
      applyPatch(Object.assign(serializePatch(), { tempo }));
    } else if (value.op === 'set-key') {
      const key = KEYS.indexOf(String(value.key ?? ''));
      if (key < 0) throw new Error(`Choose a key: ${KEYS.join(', ')}.`);
      const patch = Object.assign(serializePatch(), { key });
      if (value.scale !== undefined) {
        const scale = String(value.scale);
        if (!Object.prototype.hasOwnProperty.call(SCALES, scale))
          throw new Error(`Choose a scale: ${Object.keys(SCALES).join(', ')}.`);
        patch.scale = scale;
      }
      applyPatch(patch);
    } else throw new Error('Unsupported AM-1 operation.');
    persistSession();
    await save();
    return inspect();
  }
  function listen() {
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
          if (!hydrating) persistSession();
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
  }
  /** After the instrument has loaded: its own writes and downloads become Garden saves. */
  function attach() {
    const setItem = Storage.prototype.setItem;
    const last = new Map();
    Storage.prototype.setItem = function (key, value) {
      setItem.call(this, key, value);
      if (
        this === localStorage &&
        typeof key === 'string' &&
        key.startsWith('am1.') &&
        last.get(key) !== value
      ) {
        last.set(key, value);
        dirty();
      }
    };
    document.addEventListener(
      'click',
      (event) => {
        const a = event.target instanceof Element ? event.target.closest('a[download]') : null;
        if (!a || !a.href.startsWith('blob:')) return;
        event.preventDefault();
        const name = a.getAttribute('download') || 'am-1-file';
        fetch(a.href)
          .then((r) => r.blob())
          .then((blob) => keep(blob, name))
          .catch((error) => show(error.message));
      },
      true,
    );
    hydrating = false;
    persistSession(); // the instrument writes its keys; the first write records the greeting session
    revision++;
    save().catch(() => {});
  }
  /** Called from index.html where the instrument's script used to be: restore, then load it. */
  window.gardenBoot = async function (src) {
    const load = () =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`${src} did not load.`));
        document.body.append(script);
      });
    if (!embedded) {
      await load();
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML = '<span role="status">Opening Garden project…</span>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;align-items:center;padding:0 12px;background:#1b1a19;color:#d6d1c7;font:12px ui-monospace,Menlo,monospace;letter-spacing:.08em;border-top:1px solid #37342f}body{padding-bottom:32px}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    listen();
    try {
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      // The saved session becomes the instrument's own keys; a fresh Crux starts clean.
      for (const key of Object.values(STORE)) localStorage.removeItem(key);
      if (doc.project) {
        const p = doc.project;
        if (p.active) localStorage.setItem(STORE.active, JSON.stringify(p.active));
        if (p.era) localStorage.setItem(STORE.era, p.era);
        if (p.manual) localStorage.setItem(STORE.manual, '1');
        localStorage.setItem(STORE.patches, JSON.stringify(p.patches));
        files = p.files;
      }
      await load();
      attach();
    } catch (error) {
      show(error.message);
      throw error;
    }
  };
})();
