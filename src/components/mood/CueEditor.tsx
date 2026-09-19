import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  CUE_MAX_SECONDS,
  noteHz,
  parseCuePatch,
  renderCueTrace,
  type CuePatch,
  type CueVoice,
} from '@/audio/cue-synth';

/**
 * Craft your own cue (SYNTH-CUES-PLAN §2), with the controls a small synth
 * has: up to four voices (wave, notes, spacing, hold, ADSR, level, detune),
 * a filter, an echo, a room and a bitcrusher, and the master gain. Every
 * change goes straight back to the Mood through `onChange`, so Try always
 * plays what is on screen, and a trace of the rendered sound is drawn
 * underneath. Works with sound off: the controls show; only Try needs the
 * switch.
 */
export default function CueEditor({
  value,
  onChange,
  onTry,
  onReset,
  className,
}: {
  value: CuePatch;
  onChange: (patch: CuePatch) => void;
  onTry: () => void;
  onReset: () => void;
  className?: string;
}) {
  const [voiceIndex, setVoiceIndex] = useState(0);
  const voice = value.voices[Math.min(voiceIndex, value.voices.length - 1)]!;
  const vi = Math.min(voiceIndex, value.voices.length - 1);
  const spacing = voice.at.length > 1 ? (voice.at[1]! - voice.at[0]!) * 1000 : 80;

  const commit = (next: CuePatch) => {
    try {
      onChange(parseCuePatch(next));
    } catch {
      // out of range mid-edit: keep the last good patch
    }
  };
  const setVoice = (patch: Partial<CueVoice>) =>
    commit({
      ...value,
      voices: value.voices.map((v, i) => (i === vi ? { ...v, ...patch } : v)),
    });
  const setNotes = (text: string) => {
    const notes = text
      .split(/[\s,]+/)
      .map((n) => n.trim())
      .filter(Boolean)
      .filter((n) => {
        try {
          noteHz(n);
          return true;
        } catch {
          return false;
        }
      })
      .slice(0, 12);
    if (!notes.length) return;
    setVoice({ notes, at: notes.map((_, i) => (i * spacing) / 1000) });
  };
  const setSpacing = (ms: number) => setVoice({ at: voice.notes.map((_, i) => (i * ms) / 1000) });
  const addVoice = () => {
    if (value.voices.length >= 4) return;
    commit({ ...value, voices: [...value.voices, { ...voice, level: voice.level * 0.7 }] });
    setVoiceIndex(value.voices.length);
  };
  const removeVoice = () => {
    if (value.voices.length <= 1) return;
    commit({ ...value, voices: value.voices.filter((_, i) => i !== vi) });
    setVoiceIndex(Math.max(0, vi - 1));
  };

  // The trace: the patch rendered offline, drawn as peaks.
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void renderCueTrace(value).then((trace) => {
      const c = canvas.current;
      if (!live || !c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const w = c.width,
        h = c.height;
      ctx.clearRect(0, 0, w, h);
      const style = getComputedStyle(c);
      ctx.strokeStyle = style.getPropertyValue('--accent').trim() || '#8fd6c4';
      ctx.fillStyle = style.getPropertyValue('--accent-muted').trim() || 'rgba(143,214,196,0.25)';
      ctx.lineWidth = 1;
      if (!trace) {
        ctx.font = '10px monospace';
        ctx.fillText('no renderer here', 4, h / 2);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let i = 0; i < trace.length; i++) {
        const x = (i / (trace.length - 1)) * w;
        ctx.lineTo(x, h / 2 - trace[i]! * (h / 2 - 1));
      }
      for (let i = trace.length - 1; i >= 0; i--) {
        const x = (i / (trace.length - 1)) * w;
        ctx.lineTo(x, h / 2 + trace[i]! * (h / 2 - 1));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    return () => {
      live = false;
    };
  }, [value]);

  const field = (label: string, input: React.ReactNode, hint?: string): React.ReactNode => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-2xs font-mono uppercase tracking-wider text-text-muted">{label}</span>
      {input}
      {hint && <span className="text-3xs text-text-muted">{hint}</span>}
    </label>
  );
  const range = (
    label: string,
    v: number,
    lo: number,
    hi: number,
    step: number,
    set: (n: number) => void,
    unit = '',
  ) =>
    field(
      `${label} · ${Number.isInteger(step) ? v.toFixed(0) : v.toFixed(2)}${unit}`,
      <input
        type="range"
        aria-label={label}
        min={lo}
        max={hi}
        step={step}
        value={v}
        onChange={(e) => set(parseFloat(e.target.value))}
        className="accent-accent w-full"
      />,
    );
  const select = (
    label: string,
    v: string,
    options: [string, string][],
    set: (s: string) => void,
  ) =>
    field(
      label,
      <select
        aria-label={label}
        value={v}
        onChange={(e) => set(e.target.value)}
        className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-xxs text-text"
      >
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>,
    );
  const group = (title: string, children: React.ReactNode) => (
    <fieldset className="min-w-0">
      <legend className="text-2xs font-mono uppercase tracking-wider text-accent mb-1.5">
        {title}
      </legend>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">{children}</div>
    </fieldset>
  );

  return (
    <div
      data-testid="cue-editor"
      className={cn(
        'rounded-[var(--radius-sm)] border border-border bg-surface/60 p-3 flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Cue name"
          value={value.name}
          onChange={(e) => commit({ ...value, name: e.target.value })}
          className="h-7 flex-1 min-w-32 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs text-text"
        />
        <Button size="sm" variant="secondary" onClick={onTry}>
          Try
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Back to preset
        </Button>
      </div>

      <canvas
        ref={canvas}
        width={480}
        height={56}
        aria-label="Waveform of this cue"
        data-testid="cue-trace"
        className="w-full h-14 rounded-[var(--radius-sm)] bg-bg/60 border border-border"
      />

      <fieldset className="min-w-0">
        <legend className="text-2xs font-mono uppercase tracking-wider text-accent mb-1.5 flex items-center gap-2">
          Voice
          <span className="inline-flex gap-1" role="tablist" aria-label="Voices">
            {value.voices.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === vi}
                aria-label={`Voice ${i + 1}`}
                onClick={() => setVoiceIndex(i)}
                className={cn(
                  'px-1.5 rounded-[var(--radius-sm)] font-mono',
                  i === vi ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text',
                )}
              >
                {i + 1}
              </button>
            ))}
            {value.voices.length < 4 && (
              <button
                onClick={addVoice}
                aria-label="Add a voice"
                className="px-1.5 rounded-[var(--radius-sm)] font-mono text-text-muted hover:text-text"
              >
                +
              </button>
            )}
            {value.voices.length > 1 && (
              <button
                onClick={removeVoice}
                aria-label={`Remove voice ${vi + 1}`}
                className="px-1.5 rounded-[var(--radius-sm)] font-mono text-text-muted hover:text-error"
              >
                −
              </button>
            )}
          </span>
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
          {select(
            'Wave',
            voice.wave,
            [
              ['sine', 'Sine'],
              ['triangle', 'Triangle'],
              ['square', 'Square'],
              ['sawtooth', 'Saw'],
              ['noise', 'Noise'],
            ],
            (w) => setVoice({ wave: w as CueVoice['wave'] }),
          )}
          {field(
            'Notes',
            <input
              key={`notes-${vi}`}
              aria-label="Notes"
              defaultValue={voice.notes.join(' ')}
              onBlur={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setNotes((e.target as HTMLInputElement).value)}
              className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs font-mono text-text"
            />,
            'C0–B8, e.g. E5 B5',
          )}
          {range('Spacing', spacing, 10, 600, 5, setSpacing, ' ms')}
          {range('Detune', voice.detune ?? 0, -1200, 1200, 1, (c) => setVoice({ detune: c }), ' ¢')}
          {range(
            'Attack',
            voice.attack * 1000,
            0,
            300,
            1,
            (ms) => setVoice({ attack: ms / 1000 }),
            ' ms',
          )}
          {range(
            'Decay',
            (voice.decay ?? 0) * 1000,
            0,
            1000,
            5,
            (ms) => setVoice({ decay: ms / 1000 }),
            ' ms',
          )}
          {range('Sustain', voice.sustain ?? 1, 0, 1, 0.01, (n) => setVoice({ sustain: n }))}
          {range('Hold', voice.dur * 1000, 5, 1500, 5, (ms) => setVoice({ dur: ms / 1000 }), ' ms')}
          {range(
            'Release',
            voice.release * 1000,
            5,
            CUE_MAX_SECONDS * 1000 - 1500,
            5,
            (ms) => setVoice({ release: ms / 1000 }),
            ' ms',
          )}
          {range('Level', voice.level, 0, 1, 0.01, (n) => setVoice({ level: n }))}
        </div>
      </fieldset>

      {group(
        'Tone',
        <>
          {select(
            'Filter',
            value.filter?.type ?? 'none',
            [
              ['none', 'None'],
              ['lowpass', 'Low-pass'],
              ['highpass', 'High-pass'],
              ['bandpass', 'Band-pass'],
            ],
            (t) =>
              commit({
                ...value,
                filter:
                  t === 'none'
                    ? undefined
                    : {
                        type: t as 'lowpass',
                        hz: value.filter?.hz ?? 1200,
                        q: value.filter?.q ?? 1,
                      },
              }),
          )}
          {value.filter &&
            range(
              'Cutoff',
              value.filter.hz,
              40,
              12000,
              10,
              (hz) => commit({ ...value, filter: { ...value.filter!, hz } }),
              ' Hz',
            )}
          {value.filter &&
            range('Resonance', value.filter.q ?? 1, 0.1, 20, 0.1, (q) =>
              commit({ ...value, filter: { ...value.filter!, q } }),
            )}
          {select(
            'Bit depth',
            String(value.fx?.bitcrush ?? 16),
            [
              ['16', 'Clean'],
              ['8', '8-bit'],
              ['6', '6-bit'],
              ['4', '4-bit'],
            ],
            (b) =>
              commit({
                ...value,
                fx: { ...value.fx, bitcrush: b === '16' ? undefined : Number(b) },
              }),
          )}
          {range('Gain', value.gain, 0, 1, 0.01, (n) => commit({ ...value, gain: n }))}
        </>,
      )}

      {group(
        'Space',
        <>
          {select(
            'Echo',
            value.fx?.delay ? 'on' : 'off',
            [
              ['off', 'Off'],
              ['on', 'On'],
            ],
            (d) =>
              commit({
                ...value,
                fx: {
                  ...value.fx,
                  delay: d === 'on' ? { time: 0.2, feedback: 0.3, mix: 0.4 } : undefined,
                },
              }),
          )}
          {value.fx?.delay &&
            range(
              'Echo time',
              value.fx.delay.time * 1000,
              10,
              1000,
              10,
              (ms) =>
                commit({
                  ...value,
                  fx: { ...value.fx, delay: { ...value.fx!.delay!, time: ms / 1000 } },
                }),
              ' ms',
            )}
          {value.fx?.delay &&
            range('Feedback', value.fx.delay.feedback, 0, 0.9, 0.01, (f) =>
              commit({
                ...value,
                fx: { ...value.fx, delay: { ...value.fx!.delay!, feedback: f } },
              }),
            )}
          {value.fx?.delay &&
            range('Echo mix', value.fx.delay.mix ?? 0.5, 0, 1, 0.01, (m) =>
              commit({ ...value, fx: { ...value.fx, delay: { ...value.fx!.delay!, mix: m } } }),
            )}
          {select(
            'Reverb',
            value.fx?.reverb ? 'on' : 'off',
            [
              ['off', 'Off'],
              ['on', 'On'],
            ],
            (r) =>
              commit({
                ...value,
                fx: { ...value.fx, reverb: r === 'on' ? { seconds: 1.2, mix: 0.3 } : undefined },
              }),
          )}
          {value.fx?.reverb &&
            range(
              'Room',
              value.fx.reverb.seconds,
              0.1,
              4,
              0.1,
              (s) =>
                commit({
                  ...value,
                  fx: { ...value.fx, reverb: { ...value.fx!.reverb!, seconds: s } },
                }),
              ' s',
            )}
          {value.fx?.reverb &&
            range('Reverb mix', value.fx.reverb.mix, 0, 1, 0.01, (m) =>
              commit({ ...value, fx: { ...value.fx, reverb: { ...value.fx!.reverb!, mix: m } } }),
            )}
        </>,
      )}
    </div>
  );
}
