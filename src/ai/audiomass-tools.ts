import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { validateCommand } from '../../audiomass-crux/src/garden/commands.js';
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const time = { type: 'number', minimum: 0, maximum: 4000 };
const range = { start: time, end: time, expectedWaveformHash: hash };
const channels = {
  type: 'array',
  items: { type: 'integer', enum: [0, 1] },
  minItems: 1,
  maxItems: 2,
  uniqueItems: true,
};
const writes = ['data/project.json', 'data/assets/'];
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  paths = writes,
): AppToolDefinition {
  return {
    name,
    description,
    input_schema: { type: 'object', properties, required, additionalProperties: false },
    writes: paths,
    timeoutMs: 180000,
  };
}
export const AUDIOMASS_TOOLS: AppToolDefinition[] = [
  tool(
    'inspect_audiomass',
    'Inspect the active waveform, per-channel peak/RMS/envelope, current waveformHash, selection, clipboardHash, native historyHash and paginated arrangement tracks/clips. Optional PCM sample window: at most 128 frames per channel. Inspect before editing. Native edits use millisecond boundaries; editing a linked clip also changes its arrangement audio.',
    {
      offset: { type: 'integer', minimum: 0, maximum: 2000 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      sampleStart: { type: 'integer', minimum: 0, maximum: 32000000 },
      sampleCount: { type: 'integer', minimum: 0, maximum: 128 },
    },
    [],
    [],
  ),
  tool(
    'load_audiomass_audio',
    'Load an audio Artifact from this Crux into the native waveform editor. Provide current waveformHash when replacing audio. Detach an active linked clip first. Browser-supported WAV/MP3/OGG/FLAC/M4A/AAC/Opus/WebM, up to 32 MB compressed and 32 million mono/stereo frames. Native import preserves one Undo checkpoint but clears earlier native history; Growth retains confirmed saves.',
    { path: { type: 'string', minLength: 1, maxLength: 240 }, expectedWaveformHash: hash },
    ['path'],
  ),
  tool(
    'select_audiomass_range',
    'Select an explicit waveform time range in seconds and optional channels (defaults to all). Requires waveform view and its current hash. Does not alter audio.',
    { ...range, channels },
    ['start', 'end', 'expectedWaveformHash'],
    [],
  ),
  tool(
    'apply_audiomass_effect',
    'Apply a native effect to an explicit waveform range and chosen channels (defaults to all). Preserves samples outside the range and unselected channels. Gain uses dB; normalize uses a linear peak 0.01–1. Awaits native rendering and confirmed save. Supports native Undo.',
    {
      ...range,
      channels,
      effect: {
        type: 'string',
        enum: ['gain', 'normalize', 'fade-in', 'fade-out', 'reverse', 'mute'],
      },
      gainDb: { type: 'number', minimum: -60, maximum: 24 },
      peak: { type: 'number', minimum: 0.01, maximum: 1 },
    },
    ['start', 'end', 'expectedWaveformHash', 'effect'],
  ),
  tool(
    'edit_audiomass_range',
    'Copy, cut, delete or trim (keep only) a time range across all waveform channels. Copy/cut use the native clipboard; destructive edits support native Undo. Cut/delete must leave at least one millisecond.',
    { ...range, action: { type: 'string', enum: ['copy', 'cut', 'delete', 'trim'] } },
    ['start', 'end', 'expectedWaveformHash', 'action'],
  ),
  tool(
    'paste_audiomass_audio',
    'Paste the native clipboard at a time in seconds, optionally replacing through end. Requires current waveformHash and clipboardHash; channel count/sample rate must match. Preserves other audio and supports native Undo.',
    { at: time, end: time, expectedWaveformHash: hash, expectedClipboardHash: hash },
    ['at', 'expectedWaveformHash', 'expectedClipboardHash'],
  ),
  tool(
    'insert_audiomass_silence',
    'Insert 0.001–300 seconds of silence at an explicit waveform time, across all channels, with native Undo.',
    {
      at: time,
      seconds: { type: 'number', minimum: 0.001, maximum: 300 },
      expectedWaveformHash: hash,
    },
    ['at', 'seconds', 'expectedWaveformHash'],
  ),
  tool(
    'audiomass_history',
    'Undo or redo one native history step in waveform view. Inspect immediately beforehand; both waveformHash and historyHash must match. Native history includes manual edits and is cleared on reopening; Growth is persistent.',
    {
      direction: { type: 'string', enum: ['undo', 'redo'] },
      expectedWaveformHash: hash,
      expectedHistoryHash: hash,
    },
    ['direction', 'expectedWaveformHash', 'expectedHistoryHash'],
  ),
  tool(
    'control_audiomass_playback',
    'Play, pause or stop the current native waveform or arrangement. Does not record audio.',
    { action: { type: 'string', enum: ['play', 'pause', 'stop'] } },
    ['action'],
    [],
  ),
  tool(
    'set_audiomass_view',
    'Switch between the native waveform and multitrack views, preserving their audio.',
    { view: { type: 'string', enum: ['waveform', 'multitrack'] } },
    ['view'],
  ),
  tool(
    'detach_audiomass_waveform',
    'Detach the waveform from its inspected linked arrangement clip before importing different audio. Keeps the waveform and arrangement audio; future waveform edits no longer update that clip.',
    { expectedWaveformHash: hash },
    ['expectedWaveformHash'],
  ),
  tool(
    'rename_audiomass_track',
    'Rename an inspected native arrangement track through its normal Undo and a confirmed Garden save.',
    { id: { type: 'string' }, name: { type: 'string', minLength: 1, maxLength: 200 } },
    ['id', 'name'],
  ),
  tool(
    'save_audiomass_output',
    'Save native WAV (16-bit), MP3 (192 kbps) or FLAC output to this Crux for Cruxspace reuse. Default is the whole waveform as WAV. Choose range with start/end, or mixdown for the native arrangement (optional start/end). Saves project first; outputs must fit 32 MB.',
    {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      format: { type: 'string', enum: ['wav', 'mp3', 'flac'] },
      target: { type: 'string', enum: ['waveform', 'range', 'mixdown'] },
      start: time,
      end: time,
    },
    ['name'],
    [...writes, 'exports/'],
  ),
];
const operations: Record<string, string> = {
  inspect_audiomass: 'inspect',
  load_audiomass_audio: 'load-audio',
  select_audiomass_range: 'selection',
  apply_audiomass_effect: 'effect',
  edit_audiomass_range: 'edit-range',
  paste_audiomass_audio: 'paste',
  insert_audiomass_silence: 'silence',
  audiomass_history: 'history',
  control_audiomass_playback: 'playback',
  set_audiomass_view: 'view',
  detach_audiomass_waveform: 'detach',
  rename_audiomass_track: 'rename-track',
  save_audiomass_output: 'save-audio',
};
export function audiomassCommand(name: string, input: Record<string, unknown>) {
  if (
    !Object.hasOwn(operations, name) ||
    Object.hasOwn(input, 'op') ||
    Object.hasOwn(input, 'label')
  )
    throw Error('Use a supported audio tool and its documented fields.');
  if (name === 'save_audiomass_output') {
    const { name: label, ...rest } = input;
    return validateCommand({ ...rest, op: operations[name], label });
  }
  return validateCommand({ ...input, op: operations[name] });
}
