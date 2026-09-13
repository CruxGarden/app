// Garden bridge for the form builder (Crux Garden). The builder keeps the form
// as plain data (name + form-js schema); inside a Crux the saved form loads
// before the editor shows, every change marks the project dirty, and a
// confirmed save writes it to data/project.json. Outside a Crux this file does
// nothing (builder.js keeps the form in the browser).
/* global builder */
(function () {
  const embedded = parent !== window;
  if (!embedded) return;
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const validateProject = (doc) => {
    if (!object(doc) || doc.version !== 1 || doc.app !== 'formjs' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
      throw Error('Invalid form project.');
    if (doc.project === null) return;
    const p = doc.project;
    if (!object(p) || Object.keys(p).some((k) => !['name', 'schema', 'saved'].includes(k))) throw Error('Invalid form record.');
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid form name.');
    if (!object(p.schema) || p.schema.type !== 'default' || !Array.isArray(p.schema.components) || p.schema.components.length > 500)
      throw Error('Invalid form schema.');
    if (JSON.stringify(p.schema).length > 2000000) throw Error('The form is too large.');
  };
  const listFields = (schema) => {
    const out = [];
    const walk = (components) => {
      for (const c of components || []) {
        if (c.key) out.push({ key: c.key, type: c.type, label: c.label || '', required: !!(c.validate && c.validate.required) });
        if (Array.isArray(c.components)) walk(c.components);
      }
    };
    walk(schema && schema.components);
    return out;
  };
  let origin, expected = null, revision = 0, saved = 0, hydrating = true, timer, status = null;
  let tail = Promise.resolve(), commandTail = Promise.resolve();
  const pending = new Map();
  const show = (text) => { if (status) status.textContent = text; };
  const send = (value) => parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*');
  const call = (value) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Garden did not confirm the save. Your form is still open.')); }, 60000);
      pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      send({ ...value, id });
    });
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
      if (hydrating) throw new Error('Wait for the saved form to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving form…');
        const doc = { version: 1, app: 'formjs', project: { ...builder.snapshot(), saved: new Date().toISOString() } };
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
    const p = builder.snapshot();
    return { name: p.name, fields: listFields(p.schema), fieldTypes: builder.fieldTypes };
  }
  async function command(value) {
    if (hydrating) throw new Error('Wait for the form to open.');
    if (value.op === 'inspect') return inspect();
    if (value.op === 'set-name') {
      const name = String(value.name ?? '').trim();
      if (!name || name.length > 200) throw new Error('Use a form name up to 200 characters.');
      builder.setName(name);
    } else if (value.op === 'add-field') {
      const label = String(value.label ?? '').trim();
      if (label.length > 200) throw new Error('Use a field label up to 200 characters.');
      const options = value.options === undefined ? undefined : value.options;
      if (options !== undefined && (!Array.isArray(options) || options.length > 50 || options.some((o) => typeof o !== 'string' || !o.trim())))
        throw new Error('Options are up to 50 short texts.');
      await builder.addField({ type: value.type, label, key: value.key, options, required: value.required === true });
    } else if (value.op === 'remove-field') {
      if (!(await builder.removeField(String(value.key ?? '')))) throw new Error('No field with that key.');
    } else throw new Error('Unsupported form operation.');
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
      (async () => { do { await save(); } while (revision !== saved); })().then(
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
  async function boot() {
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML = '<span role="status">Opening Garden project…</span>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}body{padding-bottom:32px;box-sizing:border-box}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    try {
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      await builder.load(doc.project);
      builder.onChange(() => dirty());
      hydrating = false;
      show('Saved to Garden');
      if (!doc.project) { revision++; save().catch(() => {}); }
    } catch (error) {
      show(error.message);
      throw error;
    }
  }
  boot();
})();
