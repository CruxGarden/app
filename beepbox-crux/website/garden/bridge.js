// Garden bridge for BeepBox (Crux Garden). Nothing here replaces upstream UI:
// BeepBox keeps the song in the page's URL hash (SongDocument.ts); the saved
// song becomes that hash before the editor loads, and every history change the
// editor pushes marks the project dirty and saves the hash back to
// data/project.json through the host. The editor itself is untouched.
(function () {
  const embedded = parent !== window;
  const validateProject = (doc) => {
    const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!object(doc) || doc.version !== 1 || doc.app !== 'beepbox' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
      throw Error('Invalid BeepBox project.');
    if (doc.project === null) return;
    if (!object(doc.project) || typeof doc.project.song !== 'string' || !doc.project.song || doc.project.song.length > 2000000 || !/^[0-9A-Za-z_\-%.~]+$/.test(doc.project.song))
      throw Error('Invalid BeepBox song.');
  };
  let origin, expected = null, revision = 0, saved = 0, hydrating = true, timer, editor = null;
  let tail = Promise.resolve(), commandTail = Promise.resolve();
  const pending = new Map();
  let status = null;
  const show = (text) => { if (status) status.textContent = text; };
  const send = (value) => parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*');
  const call = (value) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Garden did not confirm the save. Your draft is still open.')); }, 60000);
    pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
    send({ ...value, id });
  });
  const hashSong = () => location.hash.replace(/^#/, '');
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
      if (hydrating) throw new Error('Wait for the saved song to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving song…');
        const song = hashSong();
        const doc = { version: 1, app: 'beepbox', project: song ? { song, saved: new Date().toISOString() } : null };
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
    const song = editor.doc.song;
    return {
      key: beepbox.Config.keys[song.key]?.name ?? null,
      tempo: song.tempo,
      beatsPerBar: song.beatsPerBar,
      barCount: song.barCount,
      channels: song.channels.length,
      pitchChannels: song.pitchChannelCount,
      noiseChannels: song.noiseChannelCount,
      songLength: hashSong().length,
    };
  }
  /** Change the song the way a pasted link does: a new hash, which the editor reloads. */
  function replaceSong(mutate) {
    const song = new beepbox.Song(hashSong());
    mutate(song);
    const next = song.toBase64String();
    if (next === hashSong()) return;
    location.hash = '#' + next;
  }
  async function command(value) {
    if (hydrating) throw new Error('Wait for the song to open.');
    if (!editor) throw new Error('The editor is not running.');
    if (value.op === 'inspect') return inspect();
    if (value.op === 'set-tempo') {
      const tempo = Number(value.tempo);
      if (!Number.isInteger(tempo) || tempo < 30 || tempo > 320) throw new Error('Choose a tempo from 30 to 320 BPM.');
      replaceSong((song) => { song.tempo = tempo; });
    } else if (value.op === 'set-key') {
      const name = String(value.key ?? '');
      const index = beepbox.Config.keys.findIndex((k) => k.name === name);
      if (index < 0) throw new Error('Choose a key: ' + beepbox.Config.keys.map((k) => k.name).join(', ') + '.');
      replaceSong((song) => { song.key = index; });
    } else throw new Error('Unsupported BeepBox operation.');
    await save();
    return inspect();
  }
  window.garden = {
    /** Before the editor loads: the saved song becomes the URL hash. */
    async hydrate() {
      if (!embedded) return;
      const bar = document.createElement('div');
      bar.id = 'garden-project';
      bar.innerHTML = '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
      const style = document.createElement('style');
      style.textContent = '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}body{padding-bottom:34px}';
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
      const buttons = bar.querySelectorAll('button');
      buttons[0].onclick = () => save().catch(() => {});
      buttons[1].onclick = () => { if (revision === saved || confirm('Discard the unsaved draft and reload the saved song?')) location.reload(); };
      const loaded = await call({ op: 'read', path: 'project.json' });
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      // The song lives in the URL for BeepBox to read; the editor's own undo history stays in the session.
      localStorage.setItem('displayBrowserUrl', 'true');
      history.replaceState(null, '', location.pathname + (doc.project ? '#' + doc.project.song : ''));
      window.__gardenHasSong = !!doc.project;
    },
    /** After the editor exists: every history change the editor records is a change to save. */
    attach(instance) {
      if (!embedded) return;
      editor = instance;
      window.gardenEditor = instance; // the page's `let editor` is not reachable from outside
      const pushState = history.pushState.bind(history);
      const replaceState = history.replaceState.bind(history);
      let last = hashSong();
      const watch = () => {
        const now = hashSong();
        if (now !== last) { last = now; dirty(); }
      };
      history.pushState = (...args) => { pushState(...args); watch(); };
      history.replaceState = (...args) => { replaceState(...args); watch(); };
      window.addEventListener('hashchange', watch);
      window.addEventListener('popstate', watch);
      hydrating = false;
      show('Saved to Garden');
      if (!window.__gardenHasSong) dirty();
    },
  };
})();
