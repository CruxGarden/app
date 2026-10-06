import PaneOptions from '@/components/workspace/PaneOptions';
import { useState } from 'react';
import { buttonClass, fieldClass } from '@/components/ui';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '@/stores/audioStore';
import {
  SYNTH_PRESETS,
  SYNTH_VOICES,
  SYNTH_MODES,
  synthPreset,
  type SynthVoice,
  type SynthMode,
} from '@/audio/synth-patch';
import { Toggle } from '@/components/ui';

export default function SynthControls() {
  const {
    synth,
    setSynth,
    synthPresets,
    saveSynthPreset,
    removeSynthPreset,
    playing,
    toggle,
    volume,
    setVolume,
    enabled,
    setEnabled,
  } = useAudioStore(
    useShallow((s) => ({
      synth: s.synth,
      setSynth: s.setSynth,
      synthPresets: s.synthPresets,
      saveSynthPreset: s.saveSynthPreset,
      removeSynthPreset: s.removeSynthPreset,
      playing: s.playing,
      toggle: s.toggle,
      volume: s.volume,
      setVolume: s.setVolume,
      enabled: s.enabled,
      setEnabled: s.setEnabled,
    })),
  );
  const [error, setError] = useState('');
  const [presetName, setPresetName] = useState('');
  const change = (index: number, values: Partial<(typeof synth.tracks)[number]>) => {
    void setSynth({
      ...synth,
      tracks: synth.tracks.map((t, i) => (i === index ? { ...t, ...values } : t)),
    });
  };
  return (
    <section aria-label="Crux Synth" className="@container flex min-w-0 w-full flex-col gap-4">
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
          className={buttonClass('primary', 'sm')}
          onClick={() => {
            setError('');
            void toggle().catch((e) => setError(String(e instanceof Error ? e.message : e)));
          }}
        >
          {playing ? 'Pause synth' : 'Play synth'}
        </button>
        <label className="min-w-0 flex-1 text-xs text-text">
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
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs text-text">
        <label className="min-w-0">
          Starting sound
          <select
            aria-label="Synth preset"
            className="min-w-0 max-w-full w-full rounded bg-panel border border-border p-2"
            value=""
            onChange={(e) => {
              if (e.target.value.startsWith('mood:'))
                void setSynth(synthPresets[Number(e.target.value.slice(5))]!);
              else if (e.target.value) void setSynth(synthPreset(e.target.value));
            }}
          >
            <option value="">{synth.name}</option>
            <optgroup label="This Mood">
              {synthPresets.map((p, i) => (
                <option key={p.name} value={`mood:${i}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {Object.entries(SYNTH_PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          Root note
          <select
            aria-label="Synth root note"
            className="min-w-0 max-w-full w-full rounded bg-panel border border-border p-2"
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
      <div className="grid grid-cols-1 @[480px]:grid-cols-3 gap-3 text-xs text-text">
        <label className="min-w-0">
          Harmony
          <select
            aria-label="Synth harmony"
            className="min-w-0 max-w-full w-full rounded bg-panel border border-border p-2"
            value={synth.mode}
            onChange={(e) => void setSynth({ ...synth, mode: e.target.value as SynthMode })}
          >
            {SYNTH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === 'major' ? 'Luminous' : mode === 'minor' ? 'Reflective' : 'Floating'}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          Pace · {synth.tempo}
          <input
            aria-label="Synth tempo"
            type="range"
            min="30"
            max="100"
            step="1"
            value={synth.tempo}
            onChange={(e) => void setSynth({ ...synth, tempo: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </label>
        <label className="min-w-0">
          Space · {Math.round(synth.space * 100)}%
          <input
            aria-label="Synth space"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={synth.space}
            onChange={(e) => void setSynth({ ...synth, space: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </label>
      </div>
      <PaneOptions pane="synth" label={`Presets in this Mood (${synthPresets.length})`}>
        <div className="flex gap-2 mt-3">
          <input
            aria-label="Synth preset name"
            placeholder="Name this sound"
            maxLength={80}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className={fieldClass(undefined, 'min-w-0 flex-1')}
          />
          <button
            type="button"
            disabled={!presetName.trim()}
            className={buttonClass('secondary', 'sm')}
            onClick={() => {
              try {
                saveSynthPreset(presetName);
                setPresetName('');
                setError('');
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Save sound preset
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {synthPresets.map((p) => (
            <li key={p.name} className="flex justify-between gap-2">
              <button
                type="button"
                className={buttonClass('ghost', 'xs', '-ml-2.5')}
                aria-label={`Load sound ${p.name}`}
                onClick={() => void setSynth(p)}
              >
                {p.name}
              </button>
              <button
                type="button"
                className={buttonClass('ghost', 'xs', 'text-text-muted hover:text-error')}
                aria-label={`Delete sound ${p.name}`}
                onClick={() => removeSynthPreset(p.name)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-text-muted">
          Presets stay with this Mood. Save the Mood, then export or share it to bring your sounds
          with it. Reusing a name replaces that preset.
        </p>
      </PaneOptions>
      <div className="grid grid-cols-1 @[520px]:grid-cols-2 gap-3">
        {synth.tracks.map((t, i) => (
          <fieldset
            key={i}
            aria-label={`Track ${i + 1}`}
            className="min-w-0 rounded border border-border bg-panel p-3 flex flex-col gap-3"
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
                className={buttonClass(
                  'ghost',
                  'xs',
                  'h-6 px-2 text-text-muted aria-pressed:text-accent',
                )}
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
