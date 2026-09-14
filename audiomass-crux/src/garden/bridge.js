import { createCommandSession } from './shared/command-session.js';
import { validateCommand } from './commands.js';
import { audioCommands, checkRange } from './audio-commands.js';
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
    tail = Promise.resolve();
  const pending = new Map();
  const audioCache = new Map();
  let loading = false,
    recording = false;
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button><input aria-label="Output name" value="Audio clip"><select aria-label="Output target"><option value="waveform">Waveform</option><option value="range">Selection</option><option value="mixdown">Mixdown</option></select><select aria-label="Output format"><option value="wav">WAV</option><option value="mp3">MP3</option><option value="flac">FLAC</option></select><button>Save audio to Cruxspace</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#garden-project select{color:#fff;background:#151515;border:1px solid #697078;padding:3px;border-radius:3px}#garden-project input{width:120px;padding:3px 6px;color:#fff;background:#151515;border:1px solid #697078;border-radius:3px;font:11px system-ui}#app{height:calc(100% - 34px)!important}';
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
  const effects = new Map();
  let lastEffect = null;
  let nativeHistory = { undo: 0, redo: 0, undoId: null, redoId: null };
  app.listenFor('DidStateChange', (undo, redo) => {
    nativeHistory = {
      undo: undo.length,
      redo: redo.length,
      undoId: undo.at(-1)?.id ?? null,
      redoId: redo[0]?.id ?? null,
    };
  });
  app.listenFor('WillApplyAudioEffect', (token) => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    lastEffect = { promise, resolve };
    effects.set(token, lastEffect);
  });
  const finishEffect = (token, error) => {
    effects.get(token)?.resolve({ error });
    effects.delete(token);
    if (error) show(error);
    else dirty();
  };
  app.listenFor('DidApplyAudioEffect', (token) => finishEffect(token));
  app.listenFor('DidFailAudioEffect', (token, error) => finishEffect(token, error));
  async function runEffect(invoke) {
    const previous = lastEffect;
    invoke();
    if (lastEffect === previous)
      throw Error('The native effect did not start. Inspect the waveform and try again.');
    let timeout;
    try {
      const result = await Promise.race([
        lastEffect.promise,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(Error('The native effect is still processing. Inspect before retrying.')),
            55000,
          );
        }),
      ]);
      if (result.error) throw Error(result.error);
    } finally {
      clearTimeout(timeout);
    }
  }
  async function settle() {
    const input = document.activeElement;
    if (input?.matches('input,textarea,[contenteditable=true]') && !bar.contains(input))
      input.blur();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (recording || app.multitrack.IsRecording())
      throw new Error('Stop recording before saving this project.');
    const deadline = Date.now() + 55000;
    while (loading || app.engine.in_fx || effects.size) {
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
  const nativeCommands = audioCommands(app, {
    runEffect,
    history: () => nativeHistory,
    changed: dirty,
    baseUrl: new URL('../', location.href).href,
  });
  async function saveAudio(v) {
    await save();
    const wasInert = workspace.inert;
    workspace.inert = true;
    try {
      let buffer = app.engine.is_ready ? app.engine.wavesurfer.backend.buffer : null;
      let selection;
      if (v.target === 'mixdown') {
        const clips = app.multitrack.getState().clips;
        if (!clips.length) throw Error('Add clips to the arrangement before exporting a mixdown.');
        const end = Math.max(...clips.map((c) => c.start + c.out - c.in));
        if (v.start !== undefined) {
          checkRange({ duration: end }, v.start, v.end);
          selection = [v.start, v.end];
        }
        if (
          (selection ? selection[1] - selection[0] : end) * clips[0].buffer.sampleRate >
          32_000_000
        )
          throw Error('Choose a shorter mixdown range.');
        buffer = await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Error('The native mixdown is still rendering.')),
            55000,
          );
          try {
            app.multitrack.MixdownAsync(selection, (b) => {
              clearTimeout(timeout);
              resolve(b);
            });
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
        selection = undefined;
      } else if (v.target === 'range') {
        checkRange(buffer, v.start, v.end);
        selection = [v.start, v.end];
      }
      if (!buffer) throw Error('Load audio or create an arrangement first.');
      if (buffer.numberOfChannels > 2)
        throw Error('Native waveform outputs support mono or stereo audio.');
      const seconds = selection ? selection[1] - selection[0] : buffer.duration;
      if (
        v.format === 'wav' &&
        44 + seconds * buffer.sampleRate * buffer.numberOfChannels * 2 > 32_000_000
      )
        throw Error(
          'Choose a shorter WAV range or MP3/FLAC; Cruxspace outputs are limited to 32 MB.',
        );
      const blob = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          app.engine.FXPreviewHost.DownloadFileCancel();
          reject(Error('Audio encoding timed out. Try a shorter selection.'));
        }, 55000);
        const done = (blob) => {
          clearTimeout(timeout);
          resolve(blob);
        };
        const fail = (message) => {
          clearTimeout(timeout);
          reject(Error(message));
        };
        try {
          app.engine.FXPreviewHost.DownloadFile(
            v.label,
            v.format,
            v.format === 'mp3' ? 192 : 5,
            selection,
            buffer.numberOfChannels === 2,
            16,
            false,
            () => {},
            buffer,
            { done, fail },
          );
        } catch (error) {
          fail(error.message);
        }
      });
      const result = await call({
        op: 'save-output',
        label: v.label,
        bytes: await blob.arrayBuffer(),
        mimeType:
          v.format === 'mp3' ? 'audio/mpeg' : v.format === 'flac' ? 'audio/flac' : 'audio/wav',
      });
      show('Audio saved to Cruxspace');
      return {
        ...result,
        seconds,
        channels: buffer.numberOfChannels,
        sampleRate: buffer.sampleRate,
      };
    } finally {
      workspace.inert = wasInert;
    }
  }
  const commands = createCommandSession({
    settle: async () => {
      if (hydrating) throw Error('Wait for the audio editor to open.');
      await settle();
    },
    prepare: (input) => {
      const v = validateCommand(input);
      return v.op === 'save-audio'
        ? { mutates: true, apply: () => saveAudio(v) }
        : nativeCommands.prepare(v);
    },
    save,
  });
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
      const operation = commands.execute(message.command);
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
  bar.querySelectorAll('button')[2].onclick = () => {
    const target = bar.querySelector('[aria-label="Output target"]').value;
    const range = app.engine.wavesurfer.regions.list[0];
    commands
      .execute({
        op: 'save-audio',
        label: bar.querySelector('input').value,
        target,
        format: bar.querySelector('[aria-label="Output format"]').value,
        ...(target === 'range' ? { start: range?.start, end: range?.end } : {}),
      })
      .catch((error) => show(error.message));
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
