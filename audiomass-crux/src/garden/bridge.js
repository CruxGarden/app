import { validateProject } from './model.js';

const app = window.PKAudioEditor;
startGarden(app).catch(console.error);

export async function startGarden(app) {
  if (parent === window) return;
  let origin;
  let expected = null;
  let revision = 0,
    saved = 0,
    hydrating = true;
  let timer,
    tail = Promise.resolve(),
    commandTail = Promise.resolve();
  const pending = new Map();
  const audioCache = new Map();
  let loading = false,
    recording = false;
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#app{height:calc(100% - 34px)!important}';
  document.head.append(style);
  document.body.append(bar);
  const workspace = document.querySelector('#app');
  workspace.inert = true;
  const status = bar.querySelector('span');
  const show = (text) => {
    status.textContent = text;
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
        reject(new Error('Garden did not confirm the save. Your draft is still open.'));
      }, 60000);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
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
    timer = setTimeout(() => save().catch(() => {}), 800);
  }
  // Native imports/effects report completion through the app's event seam.
  for (const name of [
    'DidStateChange',
    'DidUpdateMultitrack',
    'DidUpdateLen',
    'DidLoadFile',
    'DidUnloadFile',
  ])
    app.listenFor(name, dirty);
  app.listenFor('WillDownloadFile', () => {
    loading = true;
    dirty();
  });
  app.listenFor('DidDownloadFile', () => {
    loading = false;
    dirty();
  });
  app.listenFor('DidActionRecordStart', () => {
    recording = true;
    dirty();
  });
  app.listenFor('DidActionRecordStop', () => {
    recording = false;
    dirty();
  });
  async function settle() {
    if (recording || app.multitrack.IsRecording())
      throw new Error('Stop recording before saving this project.');
    const deadline = Date.now() + 55000;
    while (loading || app.engine.in_fx) {
      if (Date.now() > deadline)
        throw new Error('Audio is still processing. Keep this editor open.');
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  async function encodeAudio(buffer) {
    if (!buffer) return null;
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const bytes = buffer.getChannelData(i).slice().buffer;
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      let ref = audioCache.get(digest);
      if (!ref) {
        const imported = await call({
          op: 'native-import',
          bytes,
          mimeType: 'application/octet-stream',
        });
        ref = {
          __cruxBinary: {
            path: imported.path,
            kind: 'buffer',
            type: 'application/octet-stream',
            size: bytes.byteLength,
          },
        };
        audioCache.set(digest, ref);
      }
      channels.push(ref);
    }
    return { __cruxAudio: { length: buffer.length, sampleRate: buffer.sampleRate, channels } };
  }
  async function decodeAudio(value) {
    if (!value) return null;
    const a = value.__cruxAudio;
    const buffer = app.engine.wavesurfer.backend.ac.createBuffer(
      a.channels.length,
      a.length,
      a.sampleRate,
    );
    for (let i = 0; i < a.channels.length; i++) {
      const ref = a.channels[i];
      const asset = await call({ op: 'native-read', path: ref.__cruxBinary.path });
      buffer.copyToChannel(new Float32Array(asset.bytes), i);
      audioCache.set(ref.__cruxBinary.path.slice(7, -4), ref);
    }
    return buffer;
  }
  async function capture() {
    const multitrack = app.multitrack.getState();
    const waveform = app.engine.is_ready ? app.engine.wavesurfer.backend.buffer : null;
    const project = {
      multitrack,
      waveform,
      multitrackOn: app.multitrack.IsOn(),
      editorMarkers: app.mrk.serEd(),
      multitrackMarkers: app.mrk.serMt(),
    };
    project.waveform = await encodeAudio(waveform);
    for (const clip of multitrack.clips) clip.buffer = await encodeAudio(clip.buffer);
    const result = { version: 1, app: 'audiomass', project };
    validateProject(result);
    return result;
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      await settle();
      if (hydrating) throw new Error('Wait for the saved project to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving project…');
        const doc = await capture();
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
  const inspect = () => ({
    waveform: app.engine.is_ready
      ? {
          seconds: app.engine.wavesurfer.backend.buffer.duration,
          channels: app.engine.wavesurfer.backend.buffer.numberOfChannels,
        }
      : null,
    multitrackOn: app.multitrack.IsOn(),
    tracks: app.multitrack.getState().tracks,
    clips: app.multitrack
      .getState()
      .clips.map(({ buffer, ...clip }) => ({ ...clip, seconds: buffer.duration })),
  });
  async function command(value) {
    await settle();
    if (hydrating) throw new Error('Wait for the project to open.');
    if (value.op === 'inspect') return inspect();
    if (
      value.op !== 'rename-track' ||
      typeof value.id !== 'string' ||
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 200
    )
      throw new Error('Choose a track ID and name.');
    await save();
    app.multitrack.gardenRenameTrack(value.id, value.name);
    await save();
    return inspect();
  }
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
  bar.querySelectorAll('button')[0].onclick = () => save().catch(() => {});
  bar.querySelectorAll('button')[1].onclick = () => {
    if (revision === saved || confirm('Discard the unsaved draft and reload the saved project?'))
      location.reload();
  };
  try {
    const loaded = await call({ op: 'read', path: 'project.json' });
    expected = loaded.fingerprint;
    const doc = JSON.parse(loaded.content);
    validateProject(doc);
    if (doc.project) {
      const p = doc.project;
      const waveform = await decodeAudio(p.waveform);
      if (waveform) {
        if (
          app.engine.LoadDB({
            samplerate: waveform.sampleRate,
            data: Array.from(
              { length: waveform.numberOfChannels },
              (_, i) => waveform.getChannelData(i).slice().buffer,
            ),
            markers: p.editorMarkers,
          }) === false
        )
          throw new Error('Could not restore the saved waveform.');
      }
      for (const clip of p.multitrack.clips) clip.buffer = await decodeAudio(clip.buffer);
      app.multitrack.gardenRestore(p.multitrack);
      app.mrk.loadEd(p.editorMarkers, false);
      app.mrk.loadMt(p.multitrackMarkers, false);
      app.multitrack.Toggle(p.multitrackOn);
      app.fireEvent('StateRequestClearAll');
    }
    await settle();
    hydrating = false;
    workspace.inert = false;
    show('Saved to Garden');

    // Some native controls update the current layer before committing undo state.
    for (const event of ['input', 'change', 'pointerup', 'keyup'])
      document.addEventListener(event, (e) => {
        if (e.target instanceof Node && !bar.contains(e.target)) dirty();
      });
    if (!doc.project) dirty();
  } catch (error) {
    show(error.message);
    throw error;
  }
}
