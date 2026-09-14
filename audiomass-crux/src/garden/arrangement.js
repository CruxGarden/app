// Scoped edits to the native multitrack snapshot. AudioBuffer references are shared;
// this module never creates a parallel document or changes source PCM.
export const arrangementFields = {
  'create-track': ['name', 'index'],
  'update-track': ['id', 'name', 'volume', 'pan', 'mute', 'solo'],
  'move-track': ['id', 'index'],
  'delete-track': ['id', 'deleteClips'],
  'add-clip': ['trackId', 'start', 'name', 'sourceStart', 'sourceEnd', 'expectedWaveformHash'],
  'update-clip': [
    'id',
    'trackId',
    'start',
    'name',
    'sourceStart',
    'sourceEnd',
    'fadeIn',
    'fadeOut',
  ],
  'duplicate-clip': ['id', 'trackId', 'start', 'name'],
  'split-clip': ['id', 'at'],
  'delete-clip': ['id'],
  'set-mix': ['volume'],
  'arrangement-history': ['direction', 'expectedHistoryHash', 'expectedWaveformHash'],
};
const numeric = (v, min, max) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateArrangement(v) {
  if (
    typeof v.expectedArrangementHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.expectedArrangementHash)
  )
    throw Error('Inspect the arrangement first and supply expectedArrangementHash.');
  for (const k of ['id', 'trackId'])
    if (v[k] !== undefined && (typeof v[k] !== 'string' || !v[k] || v[k].length > 200))
      throw Error('Use an inspected track or clip ID.');
  if (
    [
      'update-track',
      'move-track',
      'delete-track',
      'update-clip',
      'duplicate-clip',
      'split-clip',
      'delete-clip',
    ].includes(v.op) &&
    !v.id
  )
    throw Error('Choose an inspected ID.');
  if (v.name !== undefined && (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 200))
    throw Error('Use a nonempty name up to 200 characters.');
  if (v.op === 'create-track' && v.name === undefined) throw Error('Name the new track.');
  if (v.index !== undefined && (!Number.isInteger(v.index) || v.index < 0 || v.index > 127))
    throw Error('Use a zero-based track index from 0 to 127.');
  if (v.op === 'move-track' && v.index === undefined) throw Error('Choose the destination index.');
  for (const k of ['start', 'at', 'sourceStart', 'sourceEnd', 'fadeIn', 'fadeOut'])
    if (v[k] !== undefined && !numeric(v[k], 0, 4000))
      throw Error('Use times from 0 to 4000 seconds.');
  for (const k of ['volume', 'pan'])
    if (v[k] !== undefined && !numeric(v[k], k === 'pan' ? -1 : 0, 1))
      throw Error('Volume is linear 0–1; pan is -1 (left) to +1 (right).');
  for (const k of ['mute', 'solo', 'deleteClips'])
    if (v[k] !== undefined && typeof v[k] !== 'boolean') throw Error('Use a boolean flag.');
  if (v.op === 'add-clip' && (!v.trackId || v.start === undefined || !v.expectedWaveformHash))
    throw Error('Choose a destination track/start and the inspected source waveformHash.');
  if (v.op === 'duplicate-clip' && v.start === undefined)
    throw Error('Choose the duplicate start.');
  if (v.op === 'split-clip' && v.at === undefined) throw Error('Choose a timeline split time.');
  if (v.op === 'set-mix' && v.volume === undefined) throw Error('Choose the master volume.');
  if (
    ['update-track', 'update-clip'].includes(v.op) &&
    !arrangementFields[v.op].some((k) => k !== 'id' && v[k] !== undefined)
  )
    throw Error('Provide at least one field to update.');
  if (
    v.op === 'arrangement-history' &&
    (!['undo', 'redo'].includes(v.direction) || !v.expectedHistoryHash)
  )
    throw Error('Choose undo/redo and supply the inspected historyHash.');
  return v;
}
export function arrangementMetadata(state) {
  return JSON.stringify({
    track_uid: state.track_uid,
    clip_uid: state.clip_uid,
    tracks: state.tracks,
    clips: state.clips.map(({ buffer, ...c }) => c),
    master_vol: state.master_vol,
    xfades: state.xfades,
  });
}
export function sameArrangement(a, b) {
  return (
    arrangementMetadata(a) === arrangementMetadata(b) &&
    a.clips.every((c, i) => c.buffer === b.clips[i]?.buffer)
  );
}
export async function arrangementHash(state, hashAudio) {
  const hashes = new Map();
  for (const c of state.clips)
    if (!hashes.has(c.buffer)) hashes.set(c.buffer, await hashAudio(c.buffer));
  const bytes = new TextEncoder().encode(
    JSON.stringify([arrangementMetadata(state), state.clips.map((c) => hashes.get(c.buffer))]),
  );
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export function editArrangement(state, v, waveform) {
  const next = {
    ...state,
    tracks: state.tracks.map((t) => ({ ...t })),
    clips: state.clips.map((c) => ({ ...c })),
    xfades: { ...state.xfades },
  };
  const track = (id) => {
    const t = next.tracks.find((t) => t.id === id);
    if (!t) throw Error('Choose an existing track.');
    return t;
  };
  const clip = (id) => {
    const c = next.clips.find((c) => c.id === id);
    if (!c) throw Error('Choose an existing clip.');
    return c;
  };
  const uid = (kind) => {
    const key = kind === 'track' ? 'track_uid' : 'clip_uid',
      list = kind === 'track' ? next.tracks : next.clips,
      prefix = kind === 'track' ? 'mt' : 'mc';
    let n = next[key] || 1;
    while (list.some((item) => item.id === prefix + n)) n++;
    next[key] = n + 1;
    return prefix + n;
  };
  const clipFields = (c) => {
    if (v.trackId !== undefined) c.track = track(v.trackId).id;
    for (const [from, to] of [
      ['start', 'start'],
      ['sourceStart', 'in'],
      ['sourceEnd', 'out'],
      ['fadeIn', 'fi'],
      ['fadeOut', 'fo'],
    ])
      if (v[from] !== undefined) c[to] = v[from];
    if (v.name !== undefined) c.name = v.name.trim();
    const length = c.out - c.in;
    if (c.in < 0 || length < 0.001 || c.out > c.buffer.duration + 1e-7 || c.start + length > 4000)
      throw Error(
        'Keep at least one millisecond inside the source and the timeline under 4000 seconds.',
      );
    if (c.fi + c.fo > length + 1e-7 || [c.fi, c.fo].some((fade) => fade > 0 && fade < 0.005))
      throw Error(
        'Use zero or at least 5 ms per fade; both fades together must fit the trimmed clip.',
      );
  };
  switch (v.op) {
    case 'create-track': {
      const index = v.index ?? next.tracks.length;
      if (index > next.tracks.length || next.tracks.length >= 128)
        throw Error('Choose an insertion index within the track list; at most 128 tracks.');
      const t = {
        id: uid('track'),
        name: v.name.trim(),
        mute: false,
        solo: false,
        vol: 1,
        pan: 0,
        rec: false,
        h: 1,
      };
      next.tracks.splice(index, 0, t);
      next.selected_track = t.id;
      break;
    }
    case 'update-track': {
      const t = track(v.id);
      for (const key of ['pan', 'mute', 'solo']) if (v[key] !== undefined) t[key] = v[key];
      if (v.name !== undefined) t.name = v.name.trim();
      if (v.volume !== undefined) t.vol = v.volume;
      break;
    }
    case 'move-track': {
      const t = track(v.id);
      if (v.index >= next.tracks.length) throw Error('Choose a destination within the track list.');
      next.tracks.splice(next.tracks.indexOf(t), 1);
      next.tracks.splice(v.index, 0, t);
      break;
    }
    case 'delete-track': {
      track(v.id);
      if (next.tracks.length < 2) throw Error('Keep at least one track.');
      if (next.clips.some((c) => c.track === v.id) && !v.deleteClips)
        throw Error('This track has clips. Move them first or explicitly set deleteClips.');
      next.tracks = next.tracks.filter((t) => t.id !== v.id);
      next.clips = next.clips.filter((c) => c.track !== v.id);
      break;
    }
    case 'add-clip': {
      if (!waveform || waveform.numberOfChannels > 2)
        throw Error('Load a mono/stereo source waveform first.');
      const c = {
        id: uid('clip'),
        track: track(v.trackId).id,
        start: v.start,
        in: 0,
        out: waveform.duration,
        fi: 0,
        fo: 0,
        name: v.name?.trim() || 'Audio',
        buffer: waveform,
      };
      clipFields(c);
      next.clips.push(c);
      next.selected_clip = c.id;
      next.selected_track = c.track;
      break;
    }
    case 'update-clip':
      clipFields(clip(v.id));
      break;
    case 'duplicate-clip': {
      const c = { ...clip(v.id), id: uid('clip') };
      clipFields(c);
      next.clips.push(c);
      next.selected_clip = c.id;
      next.selected_track = c.track;
      break;
    }
    case 'split-clip': {
      const c = clip(v.id),
        rel = v.at - c.start,
        length = c.out - c.in;
      if (rel < 0.001 || length - rel < 0.001)
        throw Error('Split inside the clip, leaving at least one millisecond on each side.');
      const right = {
        ...c,
        id: uid('clip'),
        start: v.at,
        in: c.in + rel,
        fi: 0,
        fo: Math.min(c.fo, length - rel),
      };
      c.out = right.in;
      c.fo = 0;
      c.fi = Math.min(c.fi, rel);
      if (c.fi < 0.005) c.fi = 0;
      if (right.fo < 0.005) right.fo = 0;
      next.clips.splice(next.clips.indexOf(c) + 1, 0, right);
      next.selected_clip = right.id;
      break;
    }
    case 'delete-clip':
      clip(v.id);
      next.clips = next.clips.filter((c) => c.id !== v.id);
      break;
    case 'set-mix':
      next.master_vol = v.volume;
      break;
    default:
      throw Error('Choose a supported arrangement edit.');
  }
  if (next.clips.length > 2000) throw Error('Keep at most 2000 clips.');
  if (!next.tracks.some((t) => t.id === next.selected_track))
    next.selected_track = next.tracks[0]?.id;
  if (!next.clips.some((c) => c.id === next.selected_clip)) next.selected_clip = null;
  return next;
}
