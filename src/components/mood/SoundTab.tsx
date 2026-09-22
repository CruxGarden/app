import SynthControls from './SynthControls';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui';
import { useAudioStore } from '@/stores/audioStore';
import {
  CUE_EVENTS,
  CUE_KINDS,
  getCues,
  saveCues,
  cueLabel,
  type CueEvent,
  type CueKind,
  type SoundCues,
  resolveCue,
} from '@/services/cues';
import { CUE_GROUPS } from '@/audio/cue-presets';
import CueEditor from './CueEditor';
import type { CuePatch } from '@/audio/cue-synth';

/** The Mood's ambient instrument and short event sounds. Website playback lives in MoodBar. */
export default function SoundTab() {
  const { init, cue } = useAudioStore(useShallow((s) => ({ init: s.init, cue: s.cue })));
  useEffect(() => init(), [init]);
  const [cues, setCues] = useState<SoundCues>(() => getCues());
  const [crafting, setCrafting] = useState<CueEvent | null>(null);
  const updateCue = (ev: CueEvent, kind: CueKind | null) => {
    const next = { ...cues, [ev]: kind };
    setCues(next);
    saveCues(next);
  };
  return (
    <div className="flex flex-col gap-5" data-testid="sound-tab">
      <SynthControls />
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
                value={
                  typeof cues[ev.id] === 'string'
                    ? (cues[ev.id] as string)
                    : cues[ev.id]
                      ? '__own'
                      : ''
                }
                onChange={(e) => {
                  if (e.target.value === '__own') return;
                  updateCue(ev.id, (e.target.value || null) as CueKind | null);
                }}
                className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-xxs text-text"
              >
                <option value="">Silent</option>
                {cues[ev.id] && typeof cues[ev.id] !== 'string' && (
                  <option value="__own">{cueLabel(cues[ev.id])} (yours)</option>
                )}
                {CUE_GROUPS.map((g) => (
                  <optgroup key={g.id} label={g.label}>
                    {CUE_KINDS.filter((k) => k.group === g.id).map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!cues[ev.id]}
                  onClick={() => cues[ev.id] && void cue(cues[ev.id]!)}
                  aria-label={`Preview cue for ${ev.label}`}
                >
                  Try
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={crafting === ev.id}
                  aria-label={`Craft cue for ${ev.label}`}
                  onClick={() => {
                    if (crafting === ev.id) return setCrafting(null);
                    // Start from what plays now, or from the plainest preset.
                    if (typeof cues[ev.id] !== 'object' || !cues[ev.id]) {
                      const start = resolveCue(cues[ev.id] ?? 'tick')!;
                      updateCue(ev.id, { ...start, name: `${start.name} (yours)` });
                    }
                    setCrafting(ev.id);
                  }}
                >
                  Craft…
                </Button>
              </div>
            </div>
          ))}
        </div>
        {crafting && cues[crafting] && typeof cues[crafting] === 'object' && (
          <CueEditor
            value={cues[crafting] as CuePatch}
            onChange={(patch) => updateCue(crafting, patch)}
            onTry={() => void cue(cues[crafting]!)}
            onReset={() => {
              updateCue(crafting, 'tick');
              setCrafting(null);
            }}
          />
        )}
      </section>
    </div>
  );
}
