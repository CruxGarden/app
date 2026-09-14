import { arrangementFields, validateArrangement } from './arrangement.js';
import { validateProjectArtifactPath } from './shared/project-file.js';
const fields = {
  ...Object.fromEntries(
    Object.entries(arrangementFields).map(([op, keys]) => [
      op,
      [...keys, 'expectedArrangementHash'],
    ]),
  ),
  inspect: ['offset', 'limit', 'sampleStart', 'sampleCount'],
  'load-audio': ['path', 'expectedWaveformHash'],
  selection: ['start', 'end', 'channels', 'expectedWaveformHash'],
  effect: ['effect', 'start', 'end', 'channels', 'gainDb', 'peak', 'expectedWaveformHash'],
  'edit-range': ['action', 'start', 'end', 'expectedWaveformHash'],
  paste: ['at', 'end', 'expectedWaveformHash', 'expectedClipboardHash'],
  silence: ['at', 'seconds', 'expectedWaveformHash'],
  history: ['direction', 'expectedWaveformHash', 'expectedHistoryHash'],
  playback: ['action'],
  view: ['view'],
  detach: ['expectedWaveformHash'],
  'rename-track': ['id', 'name'],
  'save-audio': ['label', 'target', 'start', 'end', 'format'],
};
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateCommand(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !Object.hasOwn(fields, input.op) ||
    Object.keys(input).some((k) => k !== 'op' && !fields[input.op].includes(k))
  )
    throw Error('Use a documented audio command and its fields.');
  const v = { ...input };
  for (const name of ['expectedWaveformHash', 'expectedClipboardHash', 'expectedHistoryHash'])
    if (v[name] !== undefined && (typeof v[name] !== 'string' || !/^[a-f0-9]{64}$/.test(v[name])))
      throw Error('Use the hash from a fresh audio inspection.');
  if (
    ['selection', 'effect', 'edit-range', 'paste', 'silence', 'history', 'detach'].includes(v.op) &&
    !v.expectedWaveformHash
  )
    throw Error('Inspect the waveform first and supply expectedWaveformHash.');
  if (v.op === 'history' && !v.expectedHistoryHash)
    throw Error('Inspect native history first and supply expectedHistoryHash.');
  if (v.op === 'paste' && !v.expectedClipboardHash)
    throw Error('Inspect the native clipboard first and supply expectedClipboardHash.');
  if (Object.hasOwn(arrangementFields, v.op)) return validateArrangement(v);
  if (v.op === 'inspect') {
    for (const [k, max] of [
      ['offset', 2000],
      ['limit', 50],
      ['sampleStart', 32_000_000],
      ['sampleCount', 128],
    ])
      if (
        v[k] !== undefined &&
        (!Number.isInteger(v[k]) || v[k] < 0 || v[k] > max || (k === 'limit' && v[k] < 1))
      )
        throw Error('Use bounded inspection offsets/counts; at most 50 clips and 128 samples.');
  }
  if (v.op === 'load-audio') {
    validateProjectArtifactPath(v.path);
    if (!/\.(wav|wave|mp3|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(v.path))
      throw Error(
        'Choose a local audio Artifact. Decoder support depends on the browser; use the native importer for other codecs.',
      );
  }
  if (
    ['selection', 'effect', 'edit-range'].includes(v.op) ||
    (v.op === 'save-audio' && (v.start !== undefined || v.end !== undefined))
  )
    if (!number(v.start, 0, 4000) || !number(v.end, 0, 4000) || v.end - v.start < 0.001)
      throw Error('Choose an explicit range of at least one millisecond inside the waveform.');
  if (
    v.channels !== undefined &&
    (!Array.isArray(v.channels) ||
      !v.channels.length ||
      v.channels.length > 2 ||
      new Set(v.channels).size !== v.channels.length ||
      v.channels.some((c) => ![0, 1].includes(c)))
  )
    throw Error('Choose channel indices [0], [1] or [0,1].');
  if (v.op === 'effect') {
    if (!['gain', 'normalize', 'fade-in', 'fade-out', 'reverse', 'mute'].includes(v.effect))
      throw Error('Choose gain, normalize, fade-in, fade-out, reverse or mute.');
    if (v.effect === 'gain' ? !number(v.gainDb, -60, 24) : v.gainDb !== undefined)
      throw Error('Gain requires gainDb from -60 to +24; other effects do not accept gainDb.');
    if (v.effect === 'normalize' ? !number(v.peak, 0.01, 1) : v.peak !== undefined)
      throw Error('Normalize requires a peak from 0.01 to 1; other effects do not accept peak.');
  }
  if (v.op === 'edit-range' && !['copy', 'cut', 'delete', 'trim'].includes(v.action))
    throw Error('Choose copy, cut, delete or trim (keep the range).');
  if (['paste', 'silence'].includes(v.op) && !number(v.at, 0, 4000))
    throw Error('Choose a valid insertion time in seconds.');
  if (v.op === 'paste' && v.end !== undefined && (!number(v.end, 0, 4000) || v.end - v.at < 0.001))
    throw Error('A paste replacement must end after its starting position.');
  if (v.op === 'silence' && !number(v.seconds, 0.001, 300))
    throw Error('Insert between one millisecond and five minutes of silence.');
  if (v.op === 'history' && !['undo', 'redo'].includes(v.direction))
    throw Error('Choose undo or redo.');
  if (v.op === 'playback' && !['play', 'pause', 'stop'].includes(v.action))
    throw Error('Choose play, pause or stop.');
  if (v.op === 'view' && !['waveform', 'multitrack'].includes(v.view))
    throw Error('Choose waveform or multitrack.');
  if (
    v.op === 'rename-track' &&
    (typeof v.id !== 'string' ||
      !v.id ||
      typeof v.name !== 'string' ||
      !v.name.trim() ||
      v.name.length > 200)
  )
    throw Error('Choose an inspected track ID and a name up to 200 characters.');
  if (v.op === 'save-audio') {
    if (typeof v.label !== 'string' || !v.label.trim() || v.label.length > 120)
      throw Error('Name the audio output using up to 120 characters.');
    v.label = v.label.trim();
    v.target ??= 'waveform';
    v.format ??= 'wav';
    if (!['wav', 'mp3', 'flac'].includes(v.format)) throw Error('Choose WAV, MP3 or FLAC output.');
    if (!['waveform', 'range', 'mixdown'].includes(v.target))
      throw Error('Choose waveform, range or mixdown output.');
    if (v.target === 'range' && (v.start === undefined || v.end === undefined))
      throw Error('Range output needs start and end.');
    if (v.target === 'waveform' && (v.start !== undefined || v.end !== undefined))
      throw Error('Choose range to export a selection.');
  }
  return v;
}
