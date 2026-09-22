import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '@/stores/audioStore';
import { SYNTH_PRESETS, SYNTH_VOICES, synthPreset, type SynthVoice } from '@/audio/synth-patch';
import { Toggle } from '@/components/ui';

export default function SynthControls() {
  const { synth, setSynth, playing, toggle, volume, setVolume, enabled, setEnabled } =
    useAudioStore(
      useShallow((s) => ({
        synth: s.synth,
        setSynth: s.setSynth,
        playing: s.playing,
        toggle: s.toggle,
        volume: s.volume,
        setVolume: s.setVolume,
        enabled: s.enabled,
        setEnabled: s.setEnabled,
      })),
    );
  const [error, setError] = useState('');
  const change = (index: number, values: Partial<(typeof synth.tracks)[number]>) => {
    void setSynth({
      ...synth,
      tracks: synth.tracks.map((t, i) => (i === index ? { ...t, ...values } : t)),
    });
  };
  return (
    <section aria-label="Crux Synth" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-heading">Crux Synth</h3>
          <p className="text-xs text-text-muted">Four voices, always unfolding.</p>
        </div>
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label={enabled ? 'Sound on' : 'Sound off'}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!enabled}
          className="rounded bg-accent text-bg px-3 py-2 text-xs cursor-pointer disabled:opacity-40"
          onClick={() => {
            setError('');
            void toggle().catch((e) => setError(String(e instanceof Error ? e.message : e)));
          }}
        >
          {playing ? 'Pause synth' : 'Play synth'}
        </button>
        <label className="flex-1 text-xs text-text">
          Master volume
          <input
            aria-label="Synth master volume"
            className="w-full accent-accent"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-error">
          Could not start sound: {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs text-text">
        <label>
          Starting sound
          <select
            aria-label="Synth preset"
            className="w-full rounded bg-panel border border-border p-2"
            value=""
            onChange={(e) => {
              if (e.target.value) void setSynth(synthPreset(e.target.value));
            }}
          >
            <option value="">{synth.name}</option>
            {Object.entries(SYNTH_PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Root note
          <select
            aria-label="Synth root note"
            className="w-full rounded bg-panel border border-border p-2"
            value={synth.root}
            onChange={(e) => void setSynth({ ...synth, root: Number(e.target.value) })}
          >
            {Array.from({ length: 37 }, (_, i) => i + 36).map((n) => (
              <option key={n} value={n}>
                {['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][n % 12]}
                {Math.floor(n / 12) - 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {synth.tracks.map((t, i) => (
          <fieldset
            key={i}
            aria-label={`Track ${i + 1}`}
            className="rounded border border-border bg-panel p-3 flex flex-col gap-3"
          >
            <legend className="font-display text-sm text-heading px-1">Track {i + 1}</legend>
            <div className="flex items-center justify-between gap-2">
              <select
                aria-label={`Track ${i + 1} voice`}
                className="bg-panel border border-border rounded p-1 text-xs text-text"
                value={t.voice}
                onChange={(e) => change(i, { voice: e.target.value as SynthVoice })}
              >
                {SYNTH_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {
                      {
                        pad: 'Warm pad',
                        bass: 'Deep bass',
                        bell: 'Soft bells',
                        air: 'Drifting air',
                      }[v]
                    }
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Mute track ${i + 1}`}
                aria-pressed={t.muted}
                className="text-xs text-text-muted hover:text-text cursor-pointer"
                onClick={() => change(i, { muted: !t.muted })}
              >
                {t.muted ? 'Muted' : 'Mute'}
              </button>
            </div>
            {(['level', 'tone', 'movement'] as const).map((k) => (
              <label key={k} className="text-xs text-text flex flex-col gap-1">
                <span className="flex justify-between">
                  <span>{k === 'level' ? 'Volume' : k === 'tone' ? 'Brightness' : 'Movement'}</span>
                  <span className="text-text-muted">{Math.round(t[k] * 100)}%</span>
                </span>
                <input
                  aria-label={`Track ${i + 1} ${k}`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={t[k]}
                  onChange={(e) => change(i, { [k]: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        Changes save as you play. Save your Mood to keep this sound with its look. Brightness and
        movement unfold as new notes arrive.
      </p>
    </section>
  );
}
