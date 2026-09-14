const { test } = require('node:test');
const assert = require('node:assert/strict');
const pcm = () => ({
  duration: 2,
  sampleRate: 8000,
  numberOfChannels: 1,
  length: 16000,
  getChannelData: () => new Float32Array(16000),
});
const seed = () => ({
  track_uid: 3,
  clip_uid: 2,
  tracks: [
    { id: 'mt1', name: 'Voice', vol: 1, pan: 0, mute: false, solo: false },
    { id: 'mt2', name: 'Bed', vol: 0.5, pan: 0, mute: false, solo: false },
  ],
  clips: [
    {
      id: 'mc1',
      track: 'mt1',
      name: 'Take',
      start: 1,
      in: 0,
      out: 2,
      fi: 0.2,
      fo: 0.3,
      buffer: pcm(),
    },
  ],
  master_vol: 1,
  xfades: {},
  selected_track: 'mt1',
  selected_clip: 'mc1',
});
test('arrangement edits preserve unrelated manual settings and PCM while arranging, trimming and splitting', async () => {
  const { editArrangement: edit } = await import('../arrangement.js');
  const original = seed(),
    source = original.clips[0].buffer;
  let state = edit(original, { op: 'create-track', name: 'Effect', index: 1 });
  assert.deepEqual(
    state.tracks.map((t) => t.name),
    ['Voice', 'Effect', 'Bed'],
  );
  state = edit(state, { op: 'move-track', id: 'mt3', index: 2 });
  state = edit(state, {
    op: 'update-track',
    id: 'mt3',
    volume: 0.4,
    pan: -0.5,
    mute: true,
    solo: false,
  });
  assert.deepEqual(state.tracks[1], original.tracks[1]);
  state = edit(state, { op: 'duplicate-clip', id: 'mc1', trackId: 'mt3', start: 4, name: 'Echo' });
  state = edit(state, {
    op: 'update-clip',
    id: 'mc2',
    sourceStart: 0.25,
    sourceEnd: 1.75,
    fadeIn: 0.1,
    fadeOut: 0.2,
  });
  state = edit(state, { op: 'split-clip', id: 'mc2', at: 4.75 });
  assert.deepEqual(
    state.clips.map((c) => [c.id, c.start, c.in, c.out, c.fi, c.fo]),
    [
      ['mc1', 1, 0, 2, 0.2, 0.3],
      ['mc2', 4, 0.25, 1, 0.1, 0],
      ['mc3', 4.75, 1, 1.75, 0, 0.2],
    ],
  );
  assert.ok(state.clips.every((c) => c.buffer === source));
  assert.deepEqual(
    original.tracks.map((t) => t.name),
    ['Voice', 'Bed'],
  );
  assert.equal(original.clips.length, 1);
  assert.equal(original.clips[0].out, 2);
  const mixed = edit(state, { op: 'set-mix', volume: 0.35 });
  assert.equal(mixed.master_vol, 0.35);
  assert.deepEqual(mixed.tracks, state.tracks);
  assert.deepEqual(mixed.clips, state.clips);
  assert.throws(() => edit(state, { op: 'delete-track', id: 'mt3' }), /has clips/);
  state = edit(state, { op: 'delete-track', id: 'mt3', deleteClips: true });
  assert.deepEqual(state.clips, original.clips);
  assert.equal(state.selected_clip, null);
});
test('invalid destructive arrangement operations leave input state and source PCM unchanged', async () => {
  const { editArrangement: edit } = await import('../arrangement.js');
  const state = seed(),
    before = JSON.stringify(state);
  for (const op of [
    { op: 'update-clip', id: 'mc1', sourceEnd: 4 },
    { op: 'update-clip', id: 'mc1', fadeIn: 1, fadeOut: 1.5 },
    { op: 'update-clip', id: 'mc1', fadeIn: 0.001 },
    { op: 'update-clip', id: 'mc1', sourceEnd: 0.1 },
    { op: 'update-clip', id: 'mc1', trackId: 'missing' },
    { op: 'split-clip', id: 'mc1', at: 1 },
    { op: 'move-track', id: 'mt1', index: 6 },
    { op: 'delete-clip', id: 'missing' },
  ])
    assert.throws(() => edit(state, op));
  assert.equal(JSON.stringify(state), before);
  let next = edit(state, { op: 'delete-track', id: 'mt2' });
  assert.throws(
    () => edit(next, { op: 'delete-track', id: 'mt1', deleteClips: true }),
    /at least one/,
  );
  next = edit(state, { op: 'add-clip', trackId: 'mt2', start: 3 }, state.clips[0].buffer);
  assert.equal(next.clips.at(-1).buffer, state.clips[0].buffer);
});
test('shared validator requires inspected state and refuses malformed field combinations', async () => {
  const { validateCommand: validate } = await import('../commands.js');
  const h = 'a'.repeat(64);
  for (const cmd of [
    { op: 'create-track', name: 'Track' },
    { op: 'create-track', name: 'Track', expectedArrangementHash: [h] },
    { op: 'update-track', id: 'mt1', volume: 3, expectedArrangementHash: h },
    { op: 'update-clip', id: 'mc1', expectedArrangementHash: h },
    { op: 'split-clip', id: 'mc1', at: NaN, expectedArrangementHash: h },
    { op: 'delete-track', id: 'mt1', deleteClips: 'true', expectedArrangementHash: h },
    { op: 'add-clip', trackId: 'mt1', start: 0, expectedArrangementHash: h },
    { op: 'set-mix', volume: 0.5, expectedArrangementHash: h, tracks: [] },
  ])
    assert.throws(() => validate(cmd));
  assert.equal(
    validate({ op: 'create-track', name: 'Track', expectedArrangementHash: h }).name,
    'Track',
  );
});
test('arrangement validation refuses a manual edit made during pre-save and hashes PCM changes', async () => {
  const { audioCommands, audioHash } = await import('../audio-commands.js');
  const { arrangementHash, sameArrangement } = await import('../arrangement.js');
  let state = seed(),
    applied = 0;
  const initialHash = await arrangementHash(state, audioHash);
  const app = {
    engine: { is_ready: false, wavesurfer: {} },
    multitrack: {
      getState: () => ({
        ...state,
        tracks: state.tracks.map((t) => ({ ...t })),
        clips: state.clips.map((c) => ({ ...c })),
      }),
      gardenEditingClip: () => null,
      IsOn: () => true,
      gardenApplyArrangement: () => applied++,
    },
  };
  const commands = audioCommands(app, { history: () => ({}), changed() {} });
  const pending = commands.prepare({
    op: 'set-mix',
    volume: 0.4,
    expectedArrangementHash: initialHash,
  });
  state.tracks[0].name = 'Manual title';
  await assert.rejects(pending.apply(), /arrangement changed/);
  assert.equal(applied, 0);
  assert.notEqual(await arrangementHash(state, audioHash), initialHash);
  const changed = seed();
  changed.clips[0].buffer = {
    ...changed.clips[0].buffer,
    getChannelData: () => new Float32Array(16000).fill(0.2),
  };
  assert.notEqual(await arrangementHash(changed, audioHash), initialHash);
  assert.equal(sameArrangement(seed(), changed), false);
});
