import { useId } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  CUE_MAX_SECONDS,
  noteHz,
  parseCuePatch,
  type CuePatch,
  type CueVoice,
} from '@/audio/cue-synth';

/**
 * Craft your own cue (SYNTH-CUES-PLAN §2): the first voice of a patch, on a
 * few controls — wave, notes, spacing, hold, envelope, level — plus a
 * filter, a bitcrusher, a delay and the master gain. Every change goes
 * straight back to the Mood through `onChange`, so Try always plays what is
 * on screen. Extra voices a preset had are kept as they were.
 *
 * Works with sound off: the controls show; only Try needs the switch.
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
  const uid = useId();
  const voice = value.voices[0]!;
  const spacing = voice.at.length > 1 ? (voice.at[1]! - voice.at[0]!) * 1000 : 80;

  const commit = (next: CuePatch) => {
    try {
      onChange(parseCuePatch(next));
    } catch {
      // out of range mid-edit: keep the last good patch
    }
  };
  const setVoice = (patch: Partial<CueVoice>) =>
    commit({ ...value, voices: [{ ...voice, ...patch }, ...value.voices.slice(1)] });
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
          id={`${uid}-name`}
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
            aria-label="Notes"
            defaultValue={voice.notes.join(' ')}
            onBlur={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setNotes((e.target as HTMLInputElement).value)}
            className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs font-mono text-text"
          />,
          'C0–B8, e.g. E5 B5',
        )}
        {range('Spacing', spacing, 10, 600, 5, setSpacing, ' ms')}
        {range('Hold', voice.dur * 1000, 5, 1500, 5, (ms) => setVoice({ dur: ms / 1000 }), ' ms')}
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
          'Release',
          voice.release * 1000,
          5,
          CUE_MAX_SECONDS * 1000 - 1500,
          5,
          (ms) => setVoice({ release: ms / 1000 }),
          ' ms',
        )}
        {range('Level', voice.level, 0, 1, 0.01, (n) => setVoice({ level: n }))}
        {range('Gain', value.gain, 0, 1, 0.01, (n) => commit({ ...value, gain: n }))}
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
                  : { type: t as 'lowpass', hz: value.filter?.hz ?? 1200, q: value.filter?.q ?? 1 },
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
        {select(
          'Delay',
          value.fx?.delay ? 'on' : 'off',
          [
            ['off', 'Off'],
            ['on', 'Echo'],
          ],
          (d) =>
            commit({
              ...value,
              fx: { ...value.fx, delay: d === 'on' ? { time: 0.2, feedback: 0.3 } : undefined },
            }),
        )}
      </div>
      {value.voices.length > 1 && (
        <p className="text-3xs text-text-muted">
          +{value.voices.length - 1} more {value.voices.length === 2 ? 'voice' : 'voices'} from the
          preset, kept as they were.
        </p>
      )}
    </div>
  );
}
