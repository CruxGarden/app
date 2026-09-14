const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
function pcm(channels = 2, length = 8000, rate = 8000) {
  const data = Array.from({ length: channels }, (_, c) =>
    Float32Array.from({ length }, (_, i) => (i % 19) / 100 + c / 4),
  );
  return {
    numberOfChannels: channels,
    length,
    sampleRate: rate,
    duration: length / rate,
    getChannelData: (c) => data[c],
  };
}
function native() {
  const events = [],
    renders = [],
    workers = [];
  const app = { _deps: {}, fireEvent: (...event) => events.push(event) };
  const wave = {
    backend: { buffer: pcm(), ac: { createScriptProcessor: () => ({}), createBuffer: pcm } },
    ActiveChannels: [1, 0],
    SelectedChannelsLen: 1,
    getDuration() {
      return this.backend.buffer.duration;
    },
    loadDecodedBuffer(b) {
      this.backend.buffer = b;
      return true;
    },
  };
  class Offline {
    createBufferSource() {
      return { start() {}, disconnect() {} };
    }
    startRendering() {
      return new Promise((resolve, reject) => renders.push({ resolve, reject }));
    }
  }
  class Worker {
    constructor() {
      workers.push(this);
    }
    postMessage(value) {
      (this.messages ??= []).push(value);
    }
    terminate() {
      this.terminated = true;
    }
  }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../../actions.js'), 'utf8'), {
    PKAudioEditor: app,
    window: { OfflineAudioContext: Offline },
    Worker,
    console: { log() {} },
    setTimeout,
    Float32Array,
    Int16Array,
    Int32Array,
  });
  return { app, wave, events, renders, workers, fx: new app._deps.audioutils(app, wave) };
}
test('actual native renderer signals completion and retains original channel choice and outside samples', async () => {
  const { fx, wave, events, renders } = native(),
    original = wave.backend.buffer;
  fx.FX(0.25, 0.25, { filter: () => [] });
  assert.equal(events[0][0], 'WillApplyAudioEffect');
  assert.equal(wave.backend.buffer, original);
  wave.ActiveChannels = [0, 1];
  const rendered = pcm(1, 2000);
  rendered.getChannelData(0).fill(0.75);
  renders[0].resolve(rendered);
  await new Promise(setImmediate);
  assert.equal(events.at(-1)[0], 'DidApplyAudioEffect');
  assert.equal(events[0][1], events.at(-1)[1]);
  assert.deepEqual(wave.backend.buffer.getChannelData(1), original.getChannelData(1));
  assert.deepEqual(
    wave.backend.buffer.getChannelData(0).slice(0, 2000),
    original.getChannelData(0).slice(0, 2000),
  );
  assert.deepEqual(
    wave.backend.buffer.getChannelData(0).slice(4000),
    original.getChannelData(0).slice(4000),
  );
  assert.equal(wave.backend.buffer.getChannelData(0)[2500], 0.75);
});
test('actual native renderer discards results when a person replaces audio during rendering', async () => {
  const { fx, wave, events, renders } = native();
  fx.FX(0.25, 0.25, { filter: () => [] });
  const manual = pcm();
  wave.backend.buffer = manual;
  renders[0].resolve(pcm(1, 2000));
  await new Promise(setImmediate);
  assert.equal(wave.backend.buffer, manual);
  assert.equal(events.at(-1)[0], 'DidFailAudioEffect');
  assert.match(events.at(-1)[2], /discarded/);
});
test('actual native renderer reports a rejected render so the command cannot report a saved effect', async () => {
  const { fx, wave, events, renders } = native(),
    original = wave.backend.buffer;
  fx.FX(0.25, 0.25, { filter: () => [] });
  renders[0].reject(Error('device failed'));
  await new Promise(setImmediate);
  assert.equal(wave.backend.buffer, original);
  assert.equal(events.at(-1)[0], 'DidFailAudioEffect');
  assert.equal(events.at(-1)[2], 'device failed');
});
test('native output hook uses selected PCM and delivers encoded bytes without a browser download', () => {
  const { fx, workers } = native(),
    buffer = pcm(1);
  let output;
  fx.DownloadFile('slice', 'wav', 5, [0.25, 0.5], false, 16, false, () => {}, buffer, {
    done: (b) => {
      output = b;
    },
    fail: assert.fail,
  });
  const worker = workers[0];
  assert.equal(worker.messages[0].channels, 1);
  assert.equal(worker.messages[0].samples, 2000);
  const encoded = { type: 'audio/wav' };
  worker.onmessage({ data: encoded });
  assert.equal(output, encoded);
  assert.equal(worker.terminated, true);
});
test('command guards reject traversal, stale content, changed clip context and changed native history', async () => {
  const { validateCommand } = await import('../commands.js');
  const { audioCommands } = await import('../audio-commands.js');
  for (const path of ['../input.wav', '/input.wav', 'https://host/input.wav', 'a%2Fb.wav'])
    assert.throws(() => validateCommand({ op: 'load-audio', path }));
  assert.throws(() => validateCommand({ op: 'effect', effect: 'mute', start: 0, end: 1 }));
  const { app, wave } = native();
  let clip = null,
    history = { undo: 1, redo: 0, undoId: 1 };
  app.engine = { is_ready: true, wavesurfer: wave, GetCopyBuff: () => null };
  wave.regions = { list: [] };
  wave.isPlaying = () => false;
  app.multitrack = {
    gardenEditingClip: () => clip,
    IsOn: () => false,
    getState: () => ({ tracks: [], clips: [] }),
  };
  const commands = audioCommands(app, { history: () => history, changed() {}, runEffect() {} });
  const state = await commands.inspect();
  const pending = commands.prepare({
    op: 'selection',
    start: 0,
    end: 0.25,
    expectedWaveformHash: state.waveform.waveformHash,
  });
  clip = 'manual-clip';
  await assert.rejects(pending.apply(), /changed/);
  clip = null;
  history = { ...history, undoId: 2 };
  await assert.rejects(
    commands
      .prepare({
        op: 'history',
        direction: 'undo',
        expectedWaveformHash: state.waveform.waveformHash,
        expectedHistoryHash: state.history.historyHash,
      })
      .apply(),
    /history changed/,
  );
  await assert.rejects(
    commands
      .prepare({ op: 'selection', start: 0, end: 0.25, expectedWaveformHash: 'a'.repeat(64) })
      .apply(),
    /changed/,
  );
});
test('repeated selections do not toggle an already disabled channel back on', async () => {
  const { audioCommands } = await import('../audio-commands.js');
  const { app, wave } = native();
  app.engine = { is_ready: true, wavesurfer: wave, GetCopyBuff: () => null };
  wave.regions = { list: [] };
  wave.isPlaying = () => false;
  app.multitrack = {
    gardenEditingClip: () => null,
    IsOn: () => false,
    getState: () => ({ tracks: [], clips: [] }),
  };
  app.fireEvent = (name, i, force) => {
    if (name === 'RequestChanToggle')
      wave.ActiveChannels[i] = force || (wave.ActiveChannels[i] ? 0 : 1);
  };
  const commands = audioCommands(app, { history: () => ({}), changed() {}, runEffect() {} });
  const state = await commands.inspect();
  const input = {
    op: 'selection',
    start: 0,
    end: 0.25,
    channels: [0],
    expectedWaveformHash: state.waveform.waveformHash,
  };
  await commands.prepare(input).apply();
  await commands.prepare(input).apply();
  assert.deepEqual(wave.ActiveChannels, [1, 0]);
});
