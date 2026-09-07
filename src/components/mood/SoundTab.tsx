import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { Button, Toggle } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { useAudioStore } from '@/stores/audioStore';
import {
  getAssets,
  importAssetFile,
  onAssetsChange,
  removeAsset,
  type MoodAsset,
} from '@/lib/moods/assets';
import {
  CUE_EVENTS,
  CUE_KINDS,
  getCues,
  saveCues,
  type CueEvent,
  type CueKind,
  type SoundCues,
} from '@/services/cues';
import { PauseIcon, PlayIcon } from '@/components/ui/icons';

/**
 * Sound — one section of the active Mood. A Mood plays one looping track:
 * pick it from the audio files in the garden (or add one), set the volume,
 * switch sound off. The cues the Mood plays on events live here too.
 */
export default function SoundTab() {
  const { track, enabled, playing, volume, setTrack, setEnabled, setVolume, toggle, init, cue } =
    useAudioStore(
      useShallow((s) => ({
        track: s.track,
        enabled: s.enabled,
        playing: s.playing,
        volume: s.volume,
        setTrack: s.setTrack,
        setEnabled: s.setEnabled,
        setVolume: s.setVolume,
        toggle: s.toggle,
        init: s.init,
        cue: s.cue,
      })),
    );
  useEffect(() => init(), [init]);
  const [assets, setAssets] = useState<MoodAsset[]>(() =>
    getAssets().filter((a) => a.kind === 'audio'),
  );
  useEffect(
    () => onAssetsChange(() => setAssets(getAssets().filter((a) => a.kind === 'audio'))),
    [],
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cues, setCues] = useState<SoundCues>(() => getCues());
  const updateCue = (ev: CueEvent, kind: CueKind | null) => {
    const next = { ...cues, [ev]: kind };
    setCues(next);
    saveCues(next);
  };

  const addFiles = async (files: FileList) => {
    setBusy(true);
    try {
      let first: MoodAsset | null = null;
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('audio/') && !/\.(opus|ogg|mp3|m4a|aac|wav|flac)$/i.test(f.name))
          continue;
        const a = await importAssetFile(f);
        first ??= a;
      }
      if (first) await pickTrack(first);
    } finally {
      setBusy(false);
    }
  };
  const pickTrack = (a: MoodAsset) =>
    setTrack({ fingerprint: a.fingerprint, name: a.name.replace(/\.[^.]+$/, ''), type: a.type });

  const isCurrent = (a: MoodAsset) => track?.fingerprint === a.fingerprint;

  return (
    <div className="flex flex-col gap-5" data-testid="sound-tab">
      {/* On/off + what plays */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-3xs font-mono uppercase tracking-wider text-text-muted">Track</div>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={enabled ? 'Sound on' : 'Sound off'}
          />
        </div>
        <div
          className={cn(
            'rounded-[var(--radius)] border border-border bg-panel p-3 flex items-center gap-3',
            !enabled && 'opacity-60',
          )}
        >
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={!track || !enabled}
            aria-label={playing ? 'Pause track' : 'Play track'}
            className="w-9 h-9 rounded-[var(--radius-sm)] bg-accent text-bg flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover-bright"
          >
            {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-heading truncate" data-testid="sound-track-name">
              {track ? track.name : 'No track'}
            </div>
            <div className="text-2xs font-mono text-text-muted truncate">
              {track
                ? `loops · ${track.fingerprint ? 'in your garden' : 'shipped with the app'}`
                : 'Pick an audio file below, or add one. It loops.'}
            </div>
          </div>
          {track && (
            <Button variant="ghost" size="sm" onClick={() => void setTrack(null)}>
              Remove
            </Button>
          )}
        </div>
        <label className="flex items-center gap-3 text-xs text-text-muted">
          <span className="w-14 shrink-0">Volume</span>
          <input
            type="range"
            aria-label="Track volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 accent-accent cursor-pointer"
          />
          <span className="font-mono w-8 text-right">{Math.round(volume * 100)}</span>
        </label>
      </section>

      {/* Files */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-3xs font-mono uppercase tracking-wider text-text-muted">
            Audio in your garden
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Adding…' : 'Add audio'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="audio/*,.opus,.ogg,.mp3,.m4a,.aac,.wav,.flac"
            className="hidden"
            aria-label="Add audio files"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {assets.length === 0 ? (
          <div
            className="rounded-[var(--radius)] border border-dashed border-border/70 p-5 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-sm text-heading">Bring a loop</p>
            <p className="text-xs text-text-muted mt-1">
              Opus or AAC, a few minutes long, cut to loop. It lives in your garden and travels
              inside the Mood Package.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {assets.map((a) => (
              <li
                key={a.fingerprint}
                className={cn(
                  'flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5',
                  isCurrent(a) ? 'border-accent bg-surface' : 'border-border bg-panel',
                )}
                data-testid={`audio-${a.fingerprint}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-text truncate" title={a.name}>
                    {a.name}
                  </div>
                  <div className="text-2xs font-mono text-text-muted">{formatBytes(a.size)}</div>
                </div>
                {isCurrent(a) ? (
                  <span className="text-2xs font-mono text-accent">playing as the track</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => void pickTrack(a)}>
                    Use as track
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isCurrent(a)) void setTrack(null);
                    removeAsset(a.fingerprint);
                  }}
                  aria-label={`Remove ${a.name}`}
                  className="text-text-muted hover:text-error text-xs cursor-pointer px-1"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cues */}
      <section className="flex flex-col gap-2">
        <div className="text-3xs font-mono uppercase tracking-wider text-text-muted">
          Cues — short sounds on events
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 items-center">
          {CUE_EVENTS.map((ev) => (
            <div key={ev.id} className="contents">
              <div className="min-w-0">
                <div className="text-xs text-text">{ev.label}</div>
                <div className="text-2xs text-text-muted truncate">{ev.hint}</div>
              </div>
              <select
                aria-label={`Cue for ${ev.label}`}
                value={cues[ev.id] ?? ''}
                onChange={(e) => updateCue(ev.id, (e.target.value || null) as CueKind | null)}
                className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-xxs text-text"
              >
                <option value="">Silent</option>
                {CUE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                disabled={!cues[ev.id]}
                onClick={() => cues[ev.id] && void cue(cues[ev.id]!)}
                aria-label={`Preview cue for ${ev.label}`}
              >
                Try
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
