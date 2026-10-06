/** The instrument's public controls: shared by the UI, agents and Mood packages. */
export const SYNTH_VOICES = ['pad', 'bass', 'bell', 'air'] as const;
export const SYNTH_MODES = ['major', 'minor', 'dorian'] as const;
export type SynthMode = (typeof SYNTH_MODES)[number];
export type SynthVoice = (typeof SYNTH_VOICES)[number];
export interface SynthTrack {
  voice: SynthVoice;
  level: number;
  tone: number;
  movement: number;
  muted: boolean;
}
export interface SynthPatch {
  version: 1;
  name: string;
  root: number;
  mode: SynthMode;
  tempo: number;
  space: number;
  tracks: SynthTrack[];
}
const track = (voice: SynthVoice, level: number, tone: number, movement: number): SynthTrack => ({
  voice,
  level,
  tone,
  movement,
  muted: false,
});
export const SYNTH_PRESETS: Record<string, SynthPatch> = {
  glow: {
    version: 1,
    name: 'Slow glow',
    root: 50,
    mode: 'major',
    tempo: 54,
    space: 0.6,
    tracks: [
      track('pad', 0.65, 0.4, 0.3),
      track('bass', 0.45, 0.2, 0.2),
      track('bell', 0.3, 0.5, 0.25),
      track('air', 0.2, 0.35, 0.25),
    ],
  },
  meadow: {
    version: 1,
    name: 'Open meadow',
    root: 55,
    mode: 'major',
    tempo: 68,
    space: 0.45,
    tracks: [
      track('pad', 0.5, 0.55, 0.35),
      track('bass', 0.3, 0.25, 0.3),
      track('bell', 0.45, 0.65, 0.5),
      track('air', 0.3, 0.6, 0.4),
    ],
  },
  dusk: {
    version: 1,
    name: 'Quiet dusk',
    root: 45,
    mode: 'minor',
    tempo: 42,
    space: 0.72,
    tracks: [
      track('pad', 0.6, 0.2, 0.15),
      track('bass', 0.4, 0.15, 0.1),
      track('bell', 0.2, 0.25, 0.15),
      track('air', 0.25, 0.3, 0.15),
    ],
  },
  prism: {
    version: 1,
    name: 'Prismatic drift',
    root: 53,
    mode: 'dorian',
    tempo: 62,
    space: 0.78,
    tracks: [
      track('pad', 0.55, 0.6, 0.6),
      track('bass', 0.35, 0.3, 0.3),
      track('bell', 0.5, 0.8, 0.6),
      track('air', 0.35, 0.7, 0.55),
    ],
  },
};
export function parseSynthPatch(raw: unknown): SynthPatch {
  if (!raw || typeof raw !== 'object') throw new Error('Give a synth patch');
  const p = raw as SynthPatch;
  if (p.version !== 1 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80)
    throw new Error('A synth patch needs version 1 and a name (1–80 characters)');
  if (!Number.isInteger(p.root) || p.root < 36 || p.root > 72)
    throw new Error('Root must be a MIDI note from 36 to 72');
  if (!Array.isArray(p.tracks) || p.tracks.length !== 4)
    throw new Error('Crux Synth has exactly four tracks');
  // Version 1 Moods written before these controls receive musical defaults.
  const mode = p.mode ?? 'major';
  const tempo = p.tempo ?? 54;
  const space = p.space ?? 0.6;
  if (!SYNTH_MODES.includes(mode)) throw new Error('Mode must be major, minor or dorian');
  if (!Number.isFinite(tempo) || tempo < 30 || tempo > 100)
    throw new Error('Tempo must be between 30 and 100');
  if (!Number.isFinite(space) || space < 0 || space > 1)
    throw new Error('Space must be between 0 and 1');
  const tracks = p.tracks.map((t) => {
    if (!t || !SYNTH_VOICES.includes(t.voice))
      throw new Error('Voice must be pad, bass, bell or air');
    for (const k of ['level', 'tone', 'movement'] as const)
      if (!Number.isFinite(t[k]) || t[k] < 0 || t[k] > 1)
        throw new Error(`${k} must be between 0 and 1`);
    if (typeof t.muted !== 'boolean') throw new Error('muted must be a boolean');
    return { voice: t.voice, level: t.level, tone: t.tone, movement: t.movement, muted: t.muted };
  });
  return { version: 1, name: p.name.trim(), root: p.root, mode, tempo, space, tracks };
}
export function synthPreset(id: string): SynthPatch {
  const patch = SYNTH_PRESETS[id];
  if (!patch) throw new Error(`Unknown synth preset: ${id}`);
  return parseSynthPatch(patch);
}
export function synthForMood(id: string, name: string): SynthPatch {
  const family = /plasma|prism|neon|bismuth|holo|iridescent|trance/.test(id)
    ? 'prism'
    : /meadow|sage|moss|garden|petal|summer|white|blush/.test(id)
      ? 'meadow'
      : /black|night|dusk|graphite|navy|ember|office/.test(id)
        ? 'dusk'
        : 'glow';
  const patch = synthPreset(family);
  // Every Mood gets a reproducible variation, saved as ordinary editable controls.
  const seed = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
  patch.root += [0, 2, 5, 7][seed % 4]!;
  patch.name = `${name} atmosphere`.slice(0, 80);
  return patch;
}

/** Three authored roles per Mood: the main atmosphere, a sparse focus and a moving variation. */
export function synthPresetsForMood(id: string, name: string): SynthPatch[] {
  const main = synthForMood(id, name);
  const still = parseSynthPatch({
    ...main,
    name: `${name.slice(0, 65)} · Still`,
    tempo: Math.max(30, main.tempo - 10),
  });
  still.tracks.forEach((t) => {
    t.movement *= 0.45;
    if (t.voice === 'bell') t.level *= 0.45;
  });
  const alive = parseSynthPatch({
    ...main,
    name: `${name.slice(0, 65)} · Unfolding`,
    tempo: Math.min(100, main.tempo + 10),
  });
  alive.tracks.forEach((t) => {
    t.movement = Math.min(1, t.movement + 0.25);
    t.tone = Math.min(1, t.tone + 0.08);
  });
  return [main, still, alive];
}
export function parseSynthPresets(raw: unknown): SynthPatch[] {
  if (!Array.isArray(raw) || raw.length > 32)
    throw new Error('A Mood can hold up to 32 Synth presets');
  const presets = raw.map(parseSynthPatch);
  if (new Set(presets.map((p) => p.name)).size !== presets.length)
    throw new Error('Give each Synth preset a different name');
  return presets;
}
