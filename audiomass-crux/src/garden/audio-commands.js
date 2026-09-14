import {
  arrangementFields,
  arrangementHash,
  sameArrangement,
  editArrangement,
} from './arrangement.js';
import { validateCommand } from './commands.js';
import { loadProjectBlob } from './shared/project-file.js';
const tick = () => new Promise((r) => setTimeout(r, 0));
const digest = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
export async function audioHash(buffer, context = '') {
  if (!buffer) return null;
  const hashes = [];
  for (let c = 0; c < buffer.numberOfChannels; c++)
    hashes.push(await digest(buffer.getChannelData(c)));
  return digest(
    new TextEncoder().encode(JSON.stringify([buffer.sampleRate, buffer.length, hashes, context])),
  );
}
export function checkRange(buffer, start, end) {
  if (!buffer || start < 0 || end > buffer.duration + 1e-7 || end - start < 0.001)
    throw Error('Choose a range inside the current waveform, at least one millisecond long.');
  // Native edit handlers use millisecond precision.
  return [Math.floor(start * 1000 + 1e-7) / 1000, Math.floor(end * 1000 + 1e-7) / 1000];
}
export function audioCommands(app, { runEffect, history, changed, baseUrl }) {
  const engine = app.engine,
    wave = engine.wavesurfer,
    fx = engine.FXPreviewHost;
  const buffer = () => (engine.is_ready ? wave.backend.buffer : null);
  const clip = () => app.multitrack.gardenEditingClip();
  const context = () => JSON.stringify([app.multitrack.IsOn(), clip()]);
  const fingerprint = () => audioHash(buffer(), context());
  const historyHash = () => digest(new TextEncoder().encode(JSON.stringify(history())));
  const requireWave = () => {
    if (app.multitrack.IsOn()) throw Error('Switch to waveform view before editing its audio.');
    if (!buffer()) throw Error('Load or record audio first.');
    if (buffer().numberOfChannels > 2) throw Error('Waveform tools support mono or stereo audio.');
    return buffer();
  };
  function fit(length, channels, rate) {
    if (
      !Number.isInteger(length) ||
      length < 1 ||
      length > 32_000_000 ||
      channels < 1 ||
      channels > 2 ||
      rate < 8000 ||
      rate > 192000
    )
      throw Error('Use mono/stereo audio with 1–32 million frames at 8–192 kHz.');
    const seen = new Set();
    let total = length * channels * 4;
    for (const c of app.multitrack.getState().clips)
      if (!seen.has(c.buffer)) {
        seen.add(c.buffer);
        total += c.buffer.length * c.buffer.numberOfChannels * 4;
      }
    if (total > 256_000_000) throw Error('Keep decoded audio under 256 MB across this project.');
  }
  function channels(chosen) {
    const b = buffer(),
      indices = chosen ?? Array.from({ length: b.numberOfChannels }, (_, i) => i);
    if (indices.some((i) => i >= b.numberOfChannels))
      throw Error('Choose channels that exist in this waveform.');
    // Enable first so the native control never passes through an empty selection.
    for (const i of indices) app.fireEvent('RequestChanToggle', i, 1);
    for (let i = 0; i < b.numberOfChannels; i++)
      if (!indices.includes(i) && wave.ActiveChannels[i]) app.fireEvent('RequestChanToggle', i, 0);
  }
  function select(start, end, chosen) {
    const [from, to] = checkRange(requireWave(), start, end);
    channels(chosen);
    app.fireEvent('RequestRegionClear');
    app.fireEvent('RequestSelect', false, [from, to]);
    return [from, to];
  }
  async function inspect(v = {}) {
    const b = buffer(),
      mt = app.multitrack.getState(),
      offset = v.offset ?? 0,
      limit = v.limit ?? 20;
    const statistics = [];
    if (b)
      for (let c = 0; c < b.numberOfChannels; c++) {
        const data = b.getChannelData(c);
        let peak = 0,
          energy = 0,
          invalid = 0;
        const bins = Array(32).fill(0);
        for (let i = 0; i < data.length; i++) {
          const value = Math.abs(data[i]);
          if (!Number.isFinite(value)) {
            invalid++;
            continue;
          }
          peak = Math.max(peak, value);
          energy += value * value;
          const bin = Math.min(31, Math.floor((i * 32) / data.length));
          bins[bin] = Math.max(bins[bin], value);
        }
        statistics.push({
          channel: c,
          peak,
          rms: Math.sqrt(energy / data.length),
          nonFiniteSamples: invalid,
          peakEnvelope: bins,
          samples: v.sampleCount
            ? Array.from(data.slice(v.sampleStart ?? 0, (v.sampleStart ?? 0) + v.sampleCount))
            : undefined,
        });
      }
    return {
      waveform: b
        ? {
            seconds: b.duration,
            frames: b.length,
            channels: b.numberOfChannels,
            sampleRate: b.sampleRate,
            waveformHash: await fingerprint(),
            statistics,
          }
        : null,
      selection: wave.regions.list[0]
        ? {
            start: wave.regions.list[0].start,
            end: wave.regions.list[0].end,
            channels: wave.ActiveChannels.map((on, i) => (on ? i : null)).filter((i) => i !== null),
          }
        : null,
      clipboard: engine.GetCopyBuff()
        ? {
            seconds: engine.GetCopyBuff().duration,
            clipboardHash: await audioHash(engine.GetCopyBuff()),
          }
        : null,
      multitrackOn: app.multitrack.IsOn(),
      editingClipId: clip(),
      tracks: mt.tracks.slice(offset, offset + limit),
      totalTracks: mt.tracks.length,
      arrangementHash: await arrangementHash(mt, audioHash),
      masterVolume: mt.master_vol,
      clips: mt.clips
        .slice(offset, offset + limit)
        .map(({ buffer, ...c }) => ({ ...c, seconds: buffer.duration })),
      totalClips: mt.clips.length,
      history: { ...history(), historyHash: await historyHash() },
      playing: app.multitrack.IsOn() ? app.multitrack.IsPlaying() : wave.isPlaying(),
      precision:
        'Native waveform edits use millisecond boundaries. Editing a linked clip also updates its native arrangement clip.',
    };
  }
  function prepare(input) {
    const v = validateCommand(input),
      initial = buffer(),
      initialContext = context(),
      initialArrangement = app.multitrack.getState();
    const readOnly = ['inspect', 'selection', 'playback'].includes(v.op);
    return {
      mutates: !readOnly,
      async apply() {
        if (v.op === 'inspect') return inspect(v);
        if (buffer() !== initial || context() !== initialContext)
          throw Error('The active audio changed while saving. Inspect again.');
        const needsHash =
          v.expectedWaveformHash !== undefined || (v.op === 'load-audio' && !!buffer());
        if (needsHash && v.expectedWaveformHash !== (await fingerprint()))
          throw Error(
            'The waveform or clip context changed. Inspect and use its current waveformHash.',
          );
        if (buffer() !== initial || context() !== initialContext)
          throw Error('The audio changed during validation. Inspect again.');
        if (Object.hasOwn(arrangementFields, v.op)) {
          if (clip()) throw Error('Detach the waveform before editing the arrangement.');
          const current = app.multitrack.getState();
          if (
            !sameArrangement(initialArrangement, current) ||
            v.expectedArrangementHash !== (await arrangementHash(current, audioHash)) ||
            !sameArrangement(current, app.multitrack.getState()) ||
            buffer() !== initial ||
            context() !== initialContext
          )
            throw Error('The arrangement changed. Inspect and use its current arrangementHash.');
          if (v.op === 'arrangement-history') {
            const before = JSON.stringify(history());
            if (
              v.expectedHistoryHash !== (await historyHash()) ||
              before !== JSON.stringify(history())
            )
              throw Error('Native history changed. Inspect again.');
            if (buffer() && v.expectedWaveformHash !== (await fingerprint()))
              throw Error('Supply the current waveformHash before changing native history.');
            if (
              !sameArrangement(current, app.multitrack.getState()) ||
              buffer() !== initial ||
              context() !== initialContext ||
              before !== JSON.stringify(history())
            )
              throw Error('Audio or history changed during validation. Inspect again.');
            if (!history()[v.direction]) throw Error(`There is no native ${v.direction} step.`);
            app.fireEvent(v.direction === 'undo' ? 'StateRequestUndo' : 'StateRequestRedo');
            return;
          }
          const next = editArrangement(current, v, buffer());
          if (sameArrangement(current, next)) return;
          app.multitrack.gardenApplyArrangement(next, 'Edit arrangement: ' + v.op);
          return;
        }
        if (v.op === 'view') {
          app.multitrack.Toggle(v.view === 'multitrack');
          changed();
          return;
        }
        if (v.op === 'playback') {
          app.fireEvent(
            { play: 'RequestPlay', pause: 'RequestPause', stop: 'RequestStop' }[v.action],
          );
          return;
        }
        if (v.op === 'rename-track') {
          app.multitrack.gardenRenameTrack(v.id, v.name.trim());
          return;
        }
        if (v.op === 'detach') {
          app.fireEvent('RequestDetachClipEditor');
          return;
        }
        if (v.op === 'load-audio') {
          if (clip())
            throw Error(
              'Detach the waveform from its clip before importing a different audio file.',
            );
          const blob = await loadProjectBlob(v.path, baseUrl, { label: 'audio file' });
          let decoded;
          try {
            decoded = await wave.backend.ac.decodeAudioData(await blob.arrayBuffer());
          } catch {
            throw Error(
              'This audio could not be decoded; use the native importer for codecs the browser does not support. The current waveform is unchanged.',
            );
          }
          fit(decoded.length, decoded.numberOfChannels, decoded.sampleRate);
          if (
            buffer() !== initial ||
            context() !== initialContext ||
            (needsHash && v.expectedWaveformHash !== (await fingerprint()))
          )
            throw Error('Audio changed while importing. Inspect before retrying.');
          if (buffer() !== initial || context() !== initialContext)
            throw Error('Audio changed during import validation. Inspect again.');
          app.fireEvent('RequestPause');
          app.multitrack.Toggle(false);
          engine.PreserveCurrentForUndo('Import audio');
          wave.backend._add = 0;
          if (
            engine.LoadDB({
              samplerate: decoded.sampleRate,
              data: Array.from(
                { length: decoded.numberOfChannels },
                (_, i) => decoded.getChannelData(i).slice().buffer,
              ),
              markers: [],
            }) === false
          )
            throw Error('The decoded waveform could not be loaded.');
          changed();
          return;
        }
        const b = requireWave();
        if (v.op === 'history') {
          if (v.expectedHistoryHash !== (await historyHash()))
            throw Error('Native history changed. Inspect before Undo or Redo.');
          if (buffer() !== initial || context() !== initialContext)
            throw Error('Audio changed during history validation. Inspect again.');
          if (!history()[v.direction]) throw Error(`There is no native ${v.direction} step.`);
          app.fireEvent(v.direction === 'undo' ? 'StateRequestUndo' : 'StateRequestRedo');
          return;
        }
        if (v.op === 'selection') {
          select(v.start, v.end, v.channels);
          return;
        }
        if (v.op === 'effect') {
          checkRange(b, v.start, v.end);
          if (v.channels?.some((c) => c >= b.numberOfChannels))
            throw Error('Choose an existing channel.');
          select(v.start, v.end, v.channels);
          const events = {
            gain: ['RequestActionFX_GAIN', [{ val: 10 ** (v.gainDb / 20) }]],
            mute: ['RequestActionFX_GAIN', [{ val: 0 }]],
            normalize: ['RequestActionFX_Normalize', [true, v.peak]],
            'fade-in': ['RequestActionFX_FadeIn'],
            'fade-out': ['RequestActionFX_FadeOut'],
            reverse: ['RequestActionFX_Reverse'],
          };
          await runEffect(() => app.fireEvent(...events[v.effect]));
          return;
        }
        if (v.op === 'edit-range') {
          const [from, to] = checkRange(b, v.start, v.end);
          if (['delete', 'cut'].includes(v.action) && to - from >= b.duration - 0.001)
            throw Error(
              'Leave at least one millisecond of audio; use mute to silence the whole waveform.',
            );
          select(from, to);
          if (v.action === 'copy') app.fireEvent('RequestActionCopy');
          else if (v.action === 'trim') {
            app.fireEvent('RequestPause');
            const kept = fx.Copy(from, to - from);
            app.fireEvent('StateRequestPush', {
              desc: 'Trim to selection',
              meta: [from, to - from],
              data: b,
            });
            fx.FullReplace(kept);
            app.fireEvent('RequestRegionClear');
            app.fireEvent('RequestSelect', false, [0, kept.duration]);
          } else app.fireEvent('RequestActionCut', v.action === 'cut');
          return;
        }
        if (v.op === 'silence') {
          if (v.at > b.duration) throw Error('Insert within the current waveform.');
          fit(b.length + Math.floor(v.seconds * b.sampleRate), b.numberOfChannels, b.sampleRate);
          channels();
          app.fireEvent('RequestActionSilence', v.at, v.seconds);
          return;
        }
        if (v.op === 'paste') {
          const copied = engine.GetCopyBuff();
          if (!copied || v.expectedClipboardHash !== (await audioHash(copied)))
            throw Error('The native clipboard changed. Inspect or copy a range again.');
          if (v.at > b.duration) throw Error('Paste inside the current waveform.');
          if (v.end !== undefined) checkRange(b, v.at, v.end);
          if (copied.numberOfChannels !== b.numberOfChannels || copied.sampleRate !== b.sampleRate)
            throw Error('Use clipboard audio with the same channels and sample rate.');
          fit(
            b.length + copied.length - Math.floor(((v.end ?? v.at) - v.at) * b.sampleRate),
            b.numberOfChannels,
            b.sampleRate,
          );
          if (buffer() !== b || context() !== initialContext)
            throw Error('Audio changed while validating the clipboard. Inspect again.');
          channels();
          app.fireEvent('RequestRegionClear');
          app.fireEvent('RequestSeekTo', v.at / b.duration);
          if (v.end !== undefined) app.fireEvent('RequestSelect', false, [v.at, v.end]);
          app.fireEvent('RequestActionPaste');
          return;
        }
        throw Error('Use the native audio output control for this operation.');
      },
      async result(value) {
        await tick();
        return value ?? inspect();
      },
    };
  }
  return { prepare, inspect };
}
