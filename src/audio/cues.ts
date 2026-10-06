/**
 * Sound Cues — short synthesized sounds the Mood plays on app events. Since
 * SYNTH-CUES-PLAN a cue is a patch the cue synth plays (`cue-synth.ts`), and
 * the five kinds this file used to hard-code are the first five presets.
 * This stays as the one call site the store uses; it resolves the choice and
 * shares the track player's context so ducking and cues never fight.
 */
import type { CueKind } from '@/services/cues';
import { resolveCue } from '@/services/cues';
import { playCuePatch } from './cue-synth';

export async function playCueSound(kind: CueKind, ctx?: AudioContext | null): Promise<void> {
  const patch = resolveCue(kind);
  if (!patch) return;
  await playCuePatch(patch, ctx);
}
