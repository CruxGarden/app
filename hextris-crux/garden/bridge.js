// Garden bridge for Hextris (Crux Garden). The game is untouched: this script
// loads Hextris's own scripts in their original order, and when the page runs
// inside a Crux it first restores the game's saved state and high scores (the
// two localStorage strings Hextris writes) from data/project.json and saves
// them back through the host whenever the game writes them.
(function () {
  const embedded = parent !== window;
  const KEYS = ['saveState', 'highscores'];
  const scripts = (document.currentScript.dataset.scripts || '').split(',').filter(Boolean);
  const loadScripts = () =>
    loadInOrder().then(() => document.dispatchEvent(new Event('hextris:scripts-loaded')));
  const loadInOrder = () =>
    scripts.reduce(
      (chain, src) =>
        chain.then(
          () =>
            new Promise((resolve, reject) => {
              const el = document.createElement('script');
              el.src = src;
              el.onload = resolve;
              el.onerror = () => reject(new Error('Could not load ' + src));
              document.head.appendChild(el);
            }),
        ),
      Promise.resolve(),
    );
  // The tag sits in <head> where the original script tags were; the bar needs <body>.
  const whenReady = (fn) => (document.body ? fn() : document.addEventListener('DOMContentLoaded', fn));
  if (!embedded) {
    whenReady(() => loadScripts().catch((e) => console.error(e)));
    return;
  }
  let origin, expected = null, revision = 0, saved = 0, hydrating = true, timer, dirtySince = 0;
  let tail = Promise.resolve(), commandTail = Promise.resolve();
  const pending = new Map();
  let status = null;
  const show = (t) => { if (status) status.textContent = t; };
  const send = (value) => parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*');
  const call = (value) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Garden did not confirm the save. Your draft is still open.')); }, 60000);
    pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
    send({ ...value, id });
  });
  const record = () => ({
    saveState: localStorage.getItem('saveState') || '{}',
    highscores: localStorage.getItem('highscores') || '[]',
  });
  function dirty() {
    if (hydrating) return;
    revision++;
    send({ op: 'dirty', dirty: true });
    show('Unsaved changes');
    // A running game writes its state every time a block lands; debounce, but never wait
    // longer than two seconds between saves.
    if (!dirtySince) dirtySince = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(() => {}), Math.max(0, Math.min(800, dirtySince + 2000 - Date.now())));
  }
  /** A running game is written to localStorage only when blocks land or the page unloads; capture it now. */
  function capture() {
    try {
      const gs = window.gameState;
      if (typeof window.exportSaveState === 'function' && (gs === 1 || gs === -1 || gs === 0))
        localStorage.setItem('saveState', window.exportSaveState());
    } catch (e) {
      console.warn('Hextris state capture failed', e);
    }
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      if (hydrating) throw new Error('Wait for the saved game to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      dirtySince = 0;
      try {
        show('Saving game…');
        const doc = { version: 1, app: 'hextris', project: { ...record(), saved: new Date().toISOString() } };
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
    let highscores = [];
    try { highscores = JSON.parse(localStorage.getItem('highscores') || '[]'); } catch {}
    const state = window.gameState;
    return {
      gameState: state === 1 ? 'playing' : state === -1 ? 'paused' : state === 0 ? 'ready' : state === 2 ? 'game over' : String(state),
      score: typeof window.score === 'number' ? window.score : null,
      highscores,
      hasSavedGame: (localStorage.getItem('saveState') || '{}') !== '{}',
    };
  }
  async function command(value) {
    if (hydrating) throw new Error('Wait for the game to open.');
    if (value.op === 'inspect') return inspect();
    if (value.op === 'reset') {
      localStorage.setItem('saveState', '{}');
      localStorage.setItem('highscores', '[]');
      dirty();
      await save();
      return { ...inspect(), note: 'Reload the game to start from a clean board.' };
    }
    throw new Error('Unsupported Hextris operation.');
  }
  whenReady(boot);
  function boot() {
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML = '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent = '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  window.addEventListener('message', (event) => {
    if (event.source !== parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return;
    origin = event.origin;
    if (message.type === 'crux:app:result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error)); else request?.resolve(message.result);
    } else if (message.type === 'crux:app:flush') {
      (async () => { capture(); do { await save(); } while (revision !== saved); })().then(
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
  const buttons = bar.querySelectorAll('button');
  buttons[0].onclick = () => { capture(); dirty(); save().catch(() => {}); };
  buttons[1].onclick = () => { if (revision === saved || confirm('Discard the unsaved game and reload the saved one?')) location.reload(); };
  (async () => {
    const loaded = await call({ op: 'read', path: 'project.json' });
    expected = loaded.fingerprint;
    const doc = JSON.parse(loaded.content);
    if (!doc || doc.version !== 1 || doc.app !== 'hextris') throw new Error('Invalid Hextris project.');
    for (const key of KEYS) localStorage.removeItem(key);
    if (doc.project) {
      localStorage.setItem('saveState', doc.project.saveState || '{}');
      localStorage.setItem('highscores', doc.project.highscores || '[]');
    }
    await loadScripts();
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      setItem.call(this, key, value);
      if (this === localStorage && KEYS.includes(key)) dirty();
    };
    hydrating = false;
    show('Saved to Garden');
    if (!doc.project) dirty();
  })().catch((error) => show(error.message));
  }
})();
