/**
 * Theme tools — the AI can restyle the workspace.
 *
 * Two modes, deliberately separate:
 * - preview: a transient layer on top of the user's saved theme. This is how
 *   the agent *indicates* things — an accent pulse while a build runs, a pane
 *   tinted while it works there — without ever touching what the user chose.
 *   Cleared with `reset: true` or on reload.
 * - persist: writes theme overrides exactly as the Mood Builder does. Only
 *   for when the user asked for a lasting change.
 *
 * Not crux-bound and not file-mutating: the Keeper gets these too, and a
 * theme change never triggers a snapshot.
 */
import { GARDEN_DARK } from '@/lib/moods';
import {
  activePreset,
  getThemeOverrides,
  getThemePreview,
  resolvedSection,
  setThemeOverrides,
  setThemePreview,
  applyActiveMood,
  type ThemeOverrides,
} from '@/lib/moods/active';
import { groupTokens, tokenKind, tokenLabel } from '@/lib/moods/token-groups';
import type { ToolDefinition } from './tools';
import type { ToolResultContent } from '@/services/types';

export const THEME_TOOL_NAMES = [
  'set_theme',
  'get_theme',
  'set_background',
  'get_resonance',
  'set_resonance',
] as const;

export const THEME_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_theme',
    description:
      'Read the workspace theme: the current mode and preset, the token groups, and the effective value of every token in a group. ' +
      'Call with no group to list groups (with their token names); call with a group id to see values. ' +
      'USE WHEN: before set_theme, to learn token names, or when the user asks how the workspace is styled.',
    input_schema: {
      type: 'object',
      properties: {
        group: {
          type: 'string',
          description:
            'Group id to expand, e.g. "foundation", "layout", "pane-workshop", "chat", "cards". Omit to list groups.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'set_theme',
    description:
      'Change workspace theme tokens (colors, radii, the gutter between panes, per-pane surfaces). ' +
      'mode "preview" (default) layers the change on top of the user\'s saved theme without saving it — use this to INDICATE state ' +
      '(tint the pane you are working in, pulse the accent while a build runs) and clear it afterwards with reset: true. ' +
      'mode "persist" saves the change as the user\'s theme, exactly like the Mood Builder — only when they asked for a lasting change. ' +
      'Token names are camelCase palette keys (e.g. accent, paneGap, paneWorkshopBody, paneCollaborationRadius); get_theme lists them. ' +
      'Values are CSS: hex colors, lengths ("0px", "1.5rem"), var() references, or — for pane border/body tokens — gradients.',
    input_schema: {
      type: 'object',
      properties: {
        tokens: {
          type: 'object',
          description:
            'Token name → CSS value. Example: {"paneWorkshopBody": "#112233", "paneGap": "0px"}.',
          additionalProperties: { type: 'string' },
        },
        mode: {
          type: 'string',
          enum: ['preview', 'persist'],
          description:
            "preview (default): transient, for signalling. persist: save as the user's theme.",
        },
        reset: {
          type: 'boolean',
          description:
            'true: clear the preview layer (mode preview) or remove the named tokens from the saved theme — all of them when tokens is omitted (mode persist).',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

const BACKGROUND_TOOL: ToolDefinition = {
  name: 'set_background',
  description:
    'Set the workspace background (part of the Mood). Three ways: ' +
    '`prompt` — GENERATE an image with the configured image provider and use it as the background (describe a wide, calm scene; it sits behind every pane); ' +
    '`path` — use an image file from this workspace; ' +
    '`type` — switch to a built-in animated background: bloom, drift, flow, or blank. ' +
    'USE WHEN: the user asks for a backdrop, wallpaper, or a different mood behind the workspace, or when a theme you built calls for one.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'Image description to generate (wide, atmospheric; avoid text and busy detail).',
      },
      size: {
        type: 'string',
        enum: ['1024x1024', '1536x1024', '1024x1536'],
        description: 'Generated image size. Default 1536x1024 (landscape suits a backdrop).',
      },
      path: {
        type: 'string',
        description:
          'Relative path of an existing image in the workspace, e.g. "images/night.jpg".',
      },
      type: {
        type: 'string',
        enum: ['bloom', 'drift', 'flow', 'blank'],
        description: 'A built-in background instead of an image.',
      },
    },
    required: [],
    additionalProperties: false,
  },
};
THEME_TOOL_DEFINITIONS.push(BACKGROUND_TOOL);

const LAYER_TYPE_NAMES = [
  'music',
  'rain',
  'wind',
  'noise',
  'drone',
  'pad',
  'melody',
  'sample',
  'beat',
  'keys',
  'bass',
  'vinyl',
];
const EFFECT_TYPE_NAMES = [
  'filter',
  'delay',
  'reverb',
  'chorus',
  'tremolo',
  'tape',
  'bitcrusher',
  'compressor',
];

const RESONANCE_TOOLS: ToolDefinition[] = [
  {
    name: 'get_resonance',
    description:
      'Read the soundscape (Resonance Sound Mixer): whether sound is on, the active mix, volume, every mix with its layers, the playlist, and the sound cues. ' +
      'USE WHEN: before set_resonance, or when the user asks what is playing.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'set_resonance',
    description:
      "Change or compose the soundscape. Safe signals (never rewrite the user's mixes): mix (switch by id/name), playing, volume (0..1), duck, cue. " +
      'Composing: createMix {name, root?, scale?, tempo?, master?, layers:[{type, name?, gain?, pan?, params?, effects?}], play?} builds a NEW mix, saves it and switches to it — ' +
      'this is how you answer "make me lofi study beats" or "something like a rainy jazz bar": a new mix, not edits to an existing one. ' +
      'updateMix {name?, root?, scale?, tempo?, master?} and layer / addLayer / removeLayer edit the ACTIVE mix and are saved — only when the user asks for that. ' +
      'Musical layers follow the mix key (root + scale) and tempo; keys and bass share a chord progression. ' +
      'LAYER TYPES and params — ' +
      'beat {pattern: lofi|boombap|half|four|brush, density 0..1, swing 0.5..1 (0.5 straight, 0.6 lazy), hats 0..1, tone 0..1, humanize 0..1}; ' +
      'keys {instrument: rhodes|piano|organ|bells|guitar, progression: lofi(ii-V-I)|pop(I-vi-IV-V)|axis(I-V-vi-IV)|minor(i-VII-VI-VII)|gospel|jazz|wistful|static, voicing: triad|seventh, rhythm: whole|half|stabs|arp, octave 2..5, humanize, wobble, tone}; ' +
      'bass {pattern: root|pulse|walk, progression (match keys), octave 1..3, tone, glide}; ' +
      'vinyl {crackle, dust, hum}; ' +
      'pad {waveform, octave 2..5, attack s, release s, shimmer, changeEvery bars}; drone {waveform, chord: root|root5|root5oct|minor7, octave 0..4, cutoff, movement}; ' +
      'melody {instrument: sine|triangle|sawtooth|square, octave 3..7, density, humanize, echo}; rain {intensity, brightness, drops}; wind {strength, gust, height}; noise {color: white|pink|brown, cutoff, drift}; ' +
      'music/sample {fingerprint (a workspace audio file), loop, rate}. ' +
      'EFFECTS per layer: filter {kind: lowpass|highpass|bandpass, frequency Hz, q}, delay {time s, feedback, wet}, reverb {decay s, wet}, chorus {rate, depth, wet}, tremolo {rate, depth}, tape {wobble, warmth} (lofi warmth), bitcrusher {bits 2..12, wet}, compressor {threshold dB, ratio}. ' +
      'Gains are dB (-60..6; beds around -20, leads around -12). master {reverbDecay s, reverbWet 0..1, volume dB}. Out-of-range values are clamped. A mix holds at most 12 layers, a layer at most 4 effects. ' +
      'RECIPES — lofi study: tempo 70-80, major or dorian, keys rhodes/seventh/half + tape, beat lofi swing 0.6 + bitcrusher 8 bits, bass root, vinyl, faint rain, master reverb short. ' +
      'rainy jazz bar: tempo 60, minor, keys piano/jazz/stabs, bass walk, beat brush low, rain, reverb long. ' +
      'deep focus: no beat; drone + pad (changeEvery 12) + brown noise + slow melody sparse. ' +
      'space ambient: drone fatsawtooth octave 1 + pad lydian + wind height high + long reverb.',
    input_schema: {
      type: 'object',
      properties: {
        mix: { type: 'string', description: 'Mix id or name to switch to.' },
        playing: { type: 'boolean' },
        volume: { type: 'number', description: '0..1' },
        duck: { type: 'boolean', description: 'Dip the mix while you work; release with false.' },
        cue: { type: 'string', enum: ['tick', 'chime', 'bloom', 'thud'] },
        createMix: {
          type: 'object',
          description: 'Compose a new mix (saved, then made active).',
          properties: {
            name: { type: 'string' },
            root: { type: 'string', description: 'C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B' },
            scale: {
              type: 'string',
              enum: ['major', 'minor', 'dorian', 'lydian', 'pentatonic', 'minorPentatonic'],
            },
            tempo: { type: 'number', description: 'BPM 20..200' },
            master: {
              type: 'object',
              properties: {
                reverbDecay: { type: 'number' },
                reverbWet: { type: 'number' },
                volume: { type: 'number' },
              },
            },
            layers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: LAYER_TYPE_NAMES },
                  name: { type: 'string' },
                  gain: { type: 'number' },
                  pan: { type: 'number' },
                  params: { type: 'object', additionalProperties: true },
                  effects: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: EFFECT_TYPE_NAMES },
                        params: { type: 'object', additionalProperties: true },
                      },
                      required: ['type'],
                    },
                  },
                },
                required: ['type'],
              },
            },
            play: {
              type: 'boolean',
              description: 'Start playing (only works once the user has enabled sound).',
            },
          },
          required: ['name', 'layers'],
        },
        updateMix: {
          type: 'object',
          description: "Change the active mix's key, tempo, name or master bus (saved).",
          properties: {
            name: { type: 'string' },
            root: { type: 'string' },
            scale: { type: 'string' },
            tempo: { type: 'number' },
            master: { type: 'object', additionalProperties: true },
          },
        },
        layer: {
          type: 'object',
          description: 'Edit a layer of the active mix by name.',
          properties: {
            name: { type: 'string' },
            gain: { type: 'number', description: 'dB, -60..6' },
            pan: { type: 'number' },
            muted: { type: 'boolean' },
            params: { type: 'object', additionalProperties: true },
            effects: {
              type: 'array',
              description: "Replaces the layer's effects.",
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: EFFECT_TYPE_NAMES },
                  params: { type: 'object', additionalProperties: true },
                },
                required: ['type'],
              },
            },
          },
          required: ['name'],
        },
        addLayer: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: LAYER_TYPE_NAMES },
            name: { type: 'string' },
            gain: { type: 'number' },
            pan: { type: 'number' },
            params: { type: 'object', additionalProperties: true },
            effects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: EFFECT_TYPE_NAMES },
                  params: { type: 'object', additionalProperties: true },
                },
                required: ['type'],
              },
            },
          },
          required: ['type'],
        },
        removeLayer: {
          type: 'string',
          description: 'Name of a layer of the active mix to remove.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];
THEME_TOOL_DEFINITIONS.push(...RESONANCE_TOOLS);

async function toolGetResonance(): Promise<string> {
  const { useAudioStore } = await import('@/stores/audioStore');
  const { getCues } = await import('@/services/cues');
  const s = useAudioStore.getState();
  if (!s.mixes.length) s.init();
  const st = useAudioStore.getState();
  const active = st.mixes.find((m) => m.id === st.activeMixId);
  const lines = [
    `sound: ${st.optIn ? (st.playing ? 'playing' : 'paused') : 'never enabled (the user must press play once)'}`,
    `volume: ${st.volume.toFixed(2)}`,
    `active mix: ${active ? `${active.name} (${active.id})` : 'none'}`,
    '',
    'mixes:',
    ...st.mixes.map(
      (m) =>
        `- ${m.name} (${m.id}) — ${m.root} ${m.scale}, ${m.tempo} bpm: ${
          m.layers
            .map(
              (l) =>
                `${l.name}[${l.type}${l.muted ? ', muted' : ''} ${l.gain}dB${
                  m.id === st.activeMixId
                    ? ` ${JSON.stringify(l.params)}${l.effects.length ? ' fx:' + l.effects.map((e) => e.type).join('+') : ''}`
                    : ''
                }]`,
            )
            .join(', ') || 'no layers'
        }`,
    ),
    '',
    `playlist: ${st.playlist.enabled ? 'on' : 'off'}${st.playlist.shuffle ? ', shuffle' : ''} — ${
      st.playlist.items
        .map(
          (it) => `${st.mixes.find((m) => m.id === it.mixId)?.name ?? it.mixId} ${it.minutes}min`,
        )
        .join(' → ') || 'empty'
    }`,
    `cues: ${Object.entries(getCues())
      .map(([k, v]) => `${k}=${v ?? 'off'}`)
      .join(', ')}`,
  ];
  return lines.join('\n');
}

async function toolSetResonance(input: Record<string, unknown>): Promise<string> {
  const { useAudioStore } = await import('@/stores/audioStore');
  const {
    createLayer,
    LAYER_TYPES,
    validateMix,
    createMix,
    EFFECT_TYPES,
    isValidRoot,
    isValidScale,
    MAX_LAYERS,
    MAX_EFFECTS_PER_LAYER,
    MAX_NAME_LENGTH,
  } = await import('@/audio/schema');
  const { EFFECT_DEFAULTS } = await import('@/audio/params-meta');
  const s = useAudioStore.getState();
  if (!s.mixes.length) s.init();
  const done: string[] = [];
  const warn: string[] = [];
  const st = () => useAudioStore.getState();

  if (typeof input.mix === 'string' && input.mix.trim()) {
    const q = input.mix.trim().toLowerCase();
    const m = st().mixes.find((x) => x.id.toLowerCase() === q || x.name.toLowerCase() === q);
    if (m) {
      await st().selectMix(m.id);
      done.push(`switched to "${m.name}"`);
    } else warn.push(`no mix "${input.mix}" (call get_resonance for names)`);
  }
  if (typeof input.volume === 'number') {
    st().setVolume(input.volume);
    done.push(`volume ${Math.min(1, Math.max(0, input.volume)).toFixed(2)}`);
  }
  if (typeof input.playing === 'boolean') {
    if (input.playing) {
      if (!st().optIn)
        warn.push('sound has never been enabled — the user must press play in the Mood Bar first');
      else {
        await st().play();
        done.push('playing');
      }
    } else {
      st().pause();
      done.push('paused');
    }
  }
  if (typeof input.duck === 'boolean') {
    await st().duck(input.duck);
    done.push(input.duck ? 'ducked' : 'duck released');
  }
  if (typeof input.cue === 'string' && ['tick', 'chime', 'bloom', 'thud'].includes(input.cue)) {
    if (st().optIn) {
      await st().cue(input.cue as 'tick');
      done.push(`cue ${input.cue}`);
    } else warn.push('cue skipped: sound not enabled');
  }

  const active = () => st().mixes.find((m) => m.id === st().activeMixId);

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  /** Names are capped; the model is told when it happens. */
  const clipName = (v: unknown, what: string): string | undefined => {
    if (typeof v !== 'string') return undefined;
    if (v.length <= MAX_NAME_LENGTH) return v;
    warn.push(`${what} name shortened to ${MAX_NAME_LENGTH} characters`);
    return v.slice(0, MAX_NAME_LENGTH);
  };
  /** Layer params only when they are an object (arrays / scalars are ignored). */
  const layerParams = (v: unknown) =>
    isPlainObject(v) ? { params: v as Record<string, number | string | boolean> } : {};
  /** Layer (root, scale) validity — validateMix would silently substitute defaults. */
  const checkKey = (o: Record<string, unknown>, what: string) => {
    const out: { root?: string; scale?: string } = {};
    if (o.root !== undefined) {
      if (isValidRoot(o.root)) out.root = o.root;
      else warn.push(`${what}: unknown root "${String(o.root)}" — use C, C#/Db, D … B`);
    }
    if (o.scale !== undefined) {
      if (isValidScale(o.scale)) out.scale = o.scale;
      else
        warn.push(
          `${what}: unknown scale "${String(o.scale)}" — use major, minor, dorian, lydian, pentatonic or minorPentatonic`,
        );
    }
    return out;
  };

  const normEffects = (raw: unknown, what: string) => {
    if (!Array.isArray(raw)) return undefined;
    const valid = raw.filter(
      (e) => isPlainObject(e) && (EFFECT_TYPES as string[]).includes(String(e.type)),
    ) as Record<string, unknown>[];
    if (valid.length > MAX_EFFECTS_PER_LAYER)
      warn.push(`${what}: only the first ${MAX_EFFECTS_PER_LAYER} effects were kept`);
    return valid.slice(0, MAX_EFFECTS_PER_LAYER).map((ef) => {
      const type = ef.type as (typeof EFFECT_TYPES)[number];
      return {
        type,
        enabled: ef.enabled !== false,
        params: {
          ...EFFECT_DEFAULTS[type],
          ...(isPlainObject(ef.params) ? ef.params : {}),
        } as Record<string, number | string>,
      };
    });
  };

  const create = input.createMix as Record<string, unknown> | undefined;
  if (create && typeof create.name === 'string' && Array.isArray(create.layers)) {
    const wanted = (create.layers as unknown[]).filter(
      (l) => isPlainObject(l) && (LAYER_TYPES as string[]).includes(String(l.type)),
    ) as Record<string, unknown>[];
    if (wanted.length > MAX_LAYERS)
      warn.push(`createMix: a mix holds at most ${MAX_LAYERS} layers; the rest were dropped`);
    const layers = wanted.slice(0, MAX_LAYERS).map((l) => {
      const effects = normEffects(l.effects, `layer "${String(l.name ?? l.type)}"`);
      const layerName = clipName(l.name, 'layer');
      return createLayer(l.type as (typeof LAYER_TYPES)[number], {
        ...(layerName !== undefined ? { name: layerName } : {}),
        ...(typeof l.gain === 'number' ? { gain: l.gain } : {}),
        ...(typeof l.pan === 'number' ? { pan: l.pan } : {}),
        ...layerParams(l.params),
        ...(effects ? { effects } : {}),
      });
    });
    const draft = createMix({
      name: clipName(create.name, 'mix') ?? 'New mix',
      ...checkKey(create, 'createMix'),
      ...(typeof create.tempo === 'number' ? { tempo: create.tempo } : {}),
      layers,
    });
    if (isPlainObject(create.master))
      draft.master = { ...draft.master, ...(create.master as Record<string, number>) };
    const mix = validateMix(draft);
    if (!mix || !mix.layers.length) warn.push('createMix: no valid layers');
    else {
      await st().upsertMix(mix);
      await st().selectMix(mix.id);
      done.push(
        `composed "${mix.name}" (${mix.root} ${mix.scale}, ${mix.tempo} bpm; ${mix.layers.map((l) => l.type).join(', ')}) and made it active`,
      );
      if (create.play === true) {
        if (st().optIn) {
          await st().play();
          done.push('playing');
        } else
          warn.push('not started: the user must press play in the Mood Bar once to enable sound');
      }
    }
  }

  const upd = input.updateMix as Record<string, unknown> | undefined;
  if (upd && typeof upd === 'object') {
    const mix = active();
    if (!mix) warn.push('updateMix: no active mix');
    else {
      const updName = clipName(upd.name, 'mix');
      const next = validateMix({
        ...mix,
        ...(updName !== undefined ? { name: updName } : {}),
        ...checkKey(upd, 'updateMix'),
        ...(typeof upd.tempo === 'number' ? { tempo: upd.tempo } : {}),
        master: {
          ...mix.master,
          ...(isPlainObject(upd.master) ? (upd.master as Record<string, number>) : {}),
        },
      });
      if (next) {
        await st().upsertMix(next);
        done.push(`updated "${next.name}" (${next.root} ${next.scale}, ${next.tempo} bpm; saved)`);
      }
    }
  }

  const layerEdit = input.layer as Record<string, unknown> | undefined;
  if (layerEdit && typeof layerEdit.name === 'string') {
    const mix = active();
    const target = mix?.layers.find(
      (l) => l.name.toLowerCase() === (layerEdit.name as string).toLowerCase(),
    );
    if (!mix || !target) warn.push(`no layer "${layerEdit.name}" in the active mix`);
    else {
      const next = {
        ...target,
        gain:
          typeof layerEdit.gain === 'number'
            ? Math.min(6, Math.max(-60, layerEdit.gain))
            : target.gain,
        muted: typeof layerEdit.muted === 'boolean' ? layerEdit.muted : target.muted,
        pan:
          typeof layerEdit.pan === 'number' ? Math.min(1, Math.max(-1, layerEdit.pan)) : target.pan,
        params: { ...target.params },
        effects: normEffects(layerEdit.effects, `layer "${target.name}"`) ?? target.effects,
      };
      for (const [k, v] of Object.entries(
        isPlainObject(layerEdit.params) ? layerEdit.params : {},
      )) {
        if (
          k in next.params &&
          (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
        )
          next.params[k] = v;
      }
      const saved = validateMix({
        ...mix,
        layers: mix.layers.map((l) => (l.id === target.id ? next : l)),
      });
      if (saved) await st().upsertMix(saved);
      done.push(`edited layer "${target.name}" (saved to "${mix.name}")`);
    }
  }
  const add = input.addLayer as Record<string, unknown> | undefined;
  if (add && typeof add.type === 'string') {
    const mix = active();
    if (!mix) warn.push('no active mix');
    else if (!(LAYER_TYPES as string[]).includes(add.type))
      warn.push(`unknown layer type "${add.type}"`);
    else if (mix.layers.length >= MAX_LAYERS)
      warn.push(`addLayer: "${mix.name}" already has ${MAX_LAYERS} layers (the maximum)`);
    else {
      const effects = normEffects(add.effects, `layer "${String(add.name ?? add.type)}"`);
      const addName = clipName(add.name, 'layer');
      const layer = createLayer(add.type as (typeof LAYER_TYPES)[number], {
        ...(addName !== undefined ? { name: addName } : {}),
        ...(typeof add.gain === 'number' ? { gain: add.gain } : {}),
        ...(typeof add.pan === 'number' ? { pan: add.pan } : {}),
        ...layerParams(add.params),
        ...(effects ? { effects } : {}),
      });
      const saved = validateMix({ ...mix, layers: [...mix.layers, layer] });
      if (saved) await st().upsertMix(saved);
      done.push(`added ${layer.type} layer "${layer.name}" to "${mix.name}" (saved)`);
    }
  }
  if (typeof input.removeLayer === 'string') {
    const mix = active();
    const target = mix?.layers.find(
      (l) => l.name.toLowerCase() === (input.removeLayer as string).toLowerCase(),
    );
    if (!mix || !target) warn.push(`no layer "${input.removeLayer}" to remove`);
    else {
      await st().upsertMix({ ...mix, layers: mix.layers.filter((l) => l.id !== target.id) });
      done.push(`removed layer "${target.name}" from "${mix.name}" (saved)`);
    }
  }

  if (!done.length && !warn.length)
    return 'set_resonance: nothing to do — give mix, volume, playing, duck, cue, createMix, updateMix, layer, addLayer or removeLayer.';
  return [
    done.length ? `Done: ${done.join('; ')}.` : '',
    warn.length ? `Note: ${warn.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export interface ThemeToolContext {
  cruxId?: string;
  chatModel?: string;
}

async function toolSetBackground(
  input: Record<string, unknown>,
  ctx: ThemeToolContext,
): Promise<string> {
  const { setBackgroundType, setBackgroundFromBlob, setBackgroundImage } =
    await import('@/services/background');
  const type = typeof input.type === 'string' ? input.type : '';
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const path = typeof input.path === 'string' ? input.path.replace(/^\//, '').trim() : '';

  if (type) {
    const { BgType } = await import('@/lib/types');
    const valid = [BgType.Bloom, BgType.Drift, BgType.Flow, BgType.Blank] as string[];
    if (!valid.includes(type))
      return `set_background: unknown type "${type}". Use one of ${valid.join(', ')}.`;
    await setBackgroundType(type as (typeof BgType)[keyof typeof BgType]);
    return `Background set to ${type}.`;
  }

  if (path) {
    if (!ctx.cruxId)
      return 'set_background: "path" needs a workspace; use "prompt" or "type" here.';
    const { getServices } = await import('@/services');
    const { pathOf } = await import('@/lib/artifact-path');
    const artifacts = await getServices().artifact.findByResource('crux', ctx.cruxId);
    const match = artifacts.find((a) => pathOf(a).toLowerCase() === path.toLowerCase());
    if (!match) return `set_background: no file at "${path}". Call list_files to see what exists.`;
    if (!match.mimeType?.startsWith('image/'))
      return `set_background: "${path}" is ${match.mimeType || 'not an image'}; pick an image file.`;
    if (!match.fingerprint) return `set_background: "${path}" has no stored content yet.`;
    await setBackgroundImage(match.fingerprint);
    return `Background set to the workspace image "${path}".`;
  }

  if (prompt) {
    const { generateImageBlob } = await import('./tools');
    const size = typeof input.size === 'string' ? input.size : '1536x1024';
    const generated = await generateImageBlob(prompt, size, ctx.chatModel);
    if ('error' in generated) return `set_background: ${generated.error}`;
    await setBackgroundFromBlob(generated.blob);
    return `Generated a ${size} background with ${generated.provider} and set it. The user can change or clear it in Mood → Background.`;
  }

  return 'set_background: give a prompt (generate), a path (workspace image), or a type (bloom/drift/flow/blank).';
}

export function isThemeTool(name: string): boolean {
  return (THEME_TOOL_NAMES as readonly string[]).includes(name);
}

const base = GARDEN_DARK as Record<string, string>;

function effectiveValue(key: string, saved: ThemeOverrides, preview: ThemeOverrides): string {
  return preview[key] ?? saved[key] ?? activePreset()?.overrides[key] ?? base[key] ?? '';
}

async function toolGetTheme(input: Record<string, unknown>): Promise<string> {
  const section = resolvedSection();
  const preset = activePreset();
  const saved = getThemeOverrides(section);
  const preview = getThemePreview();
  const groups = groupTokens();
  const header =
    `mode: ${section}\npreset: ${preset?.name ?? 'Garden Dark'}${preset ? ` (${preset.id})` : ''}\n` +
    `saved overrides: ${Object.keys(saved).length}\npreview tokens active: ${Object.keys(preview).length}\n`;

  const wanted = typeof input.group === 'string' ? input.group.trim() : '';
  if (wanted === 'assets') {
    const { getAssets } = await import('@/lib/moods/assets');
    const list = getAssets();
    return (
      `${header}\n## Assets (${list.length})\nUse an asset as a token value with asset:<fingerprint> — textures (workspaceTexture, pane*Texture), font faces (fontFaceDisplay/Body/Mono), or set_background {path}.\n\n` +
      (list.map((a) => `- ${a.name} (${a.kind}, ${a.type}) → asset:${a.fingerprint}`).join('\n') ||
        'none — the user adds files in Mood Builder → Assets')
    );
  }
  if (!wanted) {
    const list = groups
      .map(({ group, keys }) => `- ${group.id} — ${group.label}: ${keys.join(', ')}`)
      .join('\n');
    return `${header}\nGroups (call get_theme with a group id for values):\n${list}\n- assets — the user's files (images, audio, fonts) usable as asset:<fingerprint> values`;
  }
  const found = groups.find((g) => g.group.id === wanted);
  if (!found) {
    return `Unknown group "${wanted}". Groups: ${groups.map((g) => g.group.id).join(', ')}`;
  }
  const rows = found.keys
    .map((k) => {
      const flag = k in preview ? ' [preview]' : k in saved ? ' [saved]' : '';
      return `${k} (${tokenKind(k)}, ${tokenLabel(k, found.group)}): ${effectiveValue(k, saved, preview)}${flag}`;
    })
    .join('\n');
  return `${header}\n## ${found.group.label}\n${found.group.hint}\n\n${rows}`;
}

function toolSetTheme(input: Record<string, unknown>): string {
  const mode = input.mode === 'persist' ? 'persist' : 'preview';
  const reset = input.reset === true;
  const raw = (input.tokens ?? {}) as Record<string, unknown>;
  if (raw && typeof raw !== 'object')
    return 'set_theme: "tokens" must be an object of name → value.';

  const tokens: ThemeOverrides = {};
  const unknown: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in GARDEN_DARK)) unknown.push(k);
    else if (typeof v === 'string' && v.trim()) tokens[k] = v.trim();
  }
  if (unknown.length && Object.keys(tokens).length === 0 && !reset) {
    return `set_theme: unknown token(s): ${unknown.join(', ')}. Call get_theme to list valid names.`;
  }

  const section = resolvedSection();
  let summary: string;
  if (mode === 'preview') {
    if (reset) {
      setThemePreview(null);
      summary = 'Preview cleared — the workspace shows the saved theme again.';
    } else {
      setThemePreview(tokens, { merge: true });
      summary = `Preview applied (${Object.keys(tokens).length} token${Object.keys(tokens).length === 1 ? '' : 's'}): ${Object.entries(
        tokens,
      )
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}. Not saved; call set_theme with reset: true to clear it.`;
    }
  } else {
    const saved = getThemeOverrides(section);
    if (reset) {
      const keys = Object.keys(tokens);
      const next = keys.length
        ? Object.fromEntries(Object.entries(saved).filter(([k]) => !keys.includes(k)))
        : {};
      setThemeOverrides(section, next);
      applyActiveMood(section);
      summary = keys.length
        ? `Removed ${keys.length} saved token${keys.length === 1 ? '' : 's'} from the ${section} theme.`
        : `Cleared all saved theme overrides for the ${section} theme.`;
    } else {
      setThemeOverrides(section, { ...saved, ...tokens });
      applyActiveMood(section);
      summary = `Saved ${Object.keys(tokens).length} token${Object.keys(tokens).length === 1 ? '' : 's'} to the ${section} theme (visible in the Mood Builder).`;
    }
  }
  return unknown.length ? `${summary}\nIgnored unknown token(s): ${unknown.join(', ')}.` : summary;
}

/** Execute a theme tool. Safe without a DOM (state updates, no paint). */
export async function runThemeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ThemeToolContext = {},
): Promise<string | ToolResultContent> {
  try {
    switch (name) {
      case 'get_theme':
        return await toolGetTheme(input);
      case 'set_theme':
        return toolSetTheme(input);
      case 'set_background':
        return await toolSetBackground(input, ctx);
      case 'get_resonance':
        return await toolGetResonance();
      case 'set_resonance':
        return await toolSetResonance(input);
      default:
        return `Unknown theme tool: ${name}`;
    }
  } catch (err) {
    // A tool must report, never throw into the model loop (an engine error is not a chat error).
    console.warn(`[theme-tools] ${name} failed`, err);
    return `${name}: failed — ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Executor for callers with no workspace (the Keeper console). */
export function createThemeToolExecutor(ctx: ThemeToolContext = {}) {
  return (name: string, input: Record<string, unknown>) => runThemeTool(name, input, ctx);
}

/** Prompt guidance shared by the workspace chat and the Keeper. */
export const THEME_TOOL_GUIDANCE =
  '### Theme\n' +
  'You can restyle every part of the workspace with set_theme (get_theme lists the 25 token groups and every token name; get_theme {group} shows current values). ' +
  'Beyond colors there are tokens for shape and state: per-component radii (buttonRadius, inputRadius, cardRadius, chipRadius, tooltipRadius, dropdownRadius, bubbleRadius, meterRadius, paneRadius, paneHeaderRadius), ' +
  'shadows (elevationPanel/Card/CardHover/Modal/Dropdown/Tooltip, moodBarShadow), focus (focusRing, focusRingWidth, focusRingOffset), hover/active/disabled (hoverBrightness, activeBrightness, disabledOpacity, paneHeaderHoverBrightness, cardHoverLift, every *Hover / *Active token), ' +
  'sizes (toolbarHeight, paneHeaderHeight, paneGap, density, fontScale, fileTreeRowHeight, toggleWidth/Height, scrollbarWidth, meterHeight), textures and fonts (asset: tokens). ' +
  'Every visible element — buttons, inputs, toggles, chips, tooltips, dropdowns, cards, chat bubbles, markdown, code, file tree, top bar, mood bar, scrollbars, selection, each pane — has its own family; when the user describes a look, change the specific families rather than only foundation colors. ' +
  'Use mode "preview" to indicate what you are doing — tint the pane you are working in, warm the accent while a long step runs — and clear it with reset: true when you finish. ' +
  'Pane border and body tokens accept CSS gradients: set e.g. paneWorkshopBorder to "linear-gradient(135deg, #00f0ff, #7cff00)" (with paneBorderWidth "3px") to show that pane is being worked on, or a solid color for a state — green done, red failed — then reset. ' +
  'Use mode "persist" only when the user asks for a lasting change to how the workspace looks. ' +
  'Never persist a change the user did not ask for. ' +
  'The soundscape is yours too: get_resonance / set_resonance — switch the mix, set volume, duck while you work (release after), play a cue. ' +
  'When the user asks for music or a soundscape ("lofi study beats", "something like a rainy jazz bar", "deep focus"), COMPOSE it: set_resonance createMix with keys/bass/beat/vinyl or drone/pad/melody/rain layers in a fitting key and tempo (the tool description carries the layer catalog and recipes), then offer to tweak. ' +
  "Edits to an existing mix (layer, updateMix) rewrite the user's mix and are saved, so only make them when asked. " +
  'set_background changes what sits behind the panes: generate an image from a prompt, use a workspace image, or pick bloom/drift/flow/blank — when the user asks for a backdrop, or when a theme you are building wants one.\n\n';
