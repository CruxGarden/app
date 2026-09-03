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
      "Change the soundscape. Switching mix, volume, ducking and cues are safe signals (they don't rewrite the user's mixes); " +
      'layer edits change the active mix and are saved, so only do those when asked. ' +
      'Fields (any subset): mix (id or name to switch to), playing (true/false), volume (0..1), duck (true while you work, false after), ' +
      'cue (tick|chime|bloom|thud — a one-shot sound), layer {name, gain?, muted?, params?} (edit a layer of the active mix), ' +
      'addLayer {type, name?, gain?, params?} (types: music, rain, wind, noise, drone, pad, melody, sample), removeLayer (layer name).',
    input_schema: {
      type: 'object',
      properties: {
        mix: { type: 'string', description: 'Mix id or name to switch to.' },
        playing: { type: 'boolean' },
        volume: { type: 'number', description: '0..1' },
        duck: { type: 'boolean', description: 'Dip the mix while you work; release with false.' },
        cue: { type: 'string', enum: ['tick', 'chime', 'bloom', 'thud'] },
        layer: {
          type: 'object',
          description: 'Edit a layer of the active mix by name.',
          properties: {
            name: { type: 'string' },
            gain: { type: 'number', description: 'dB, -60..6' },
            muted: { type: 'boolean' },
            params: { type: 'object', additionalProperties: true },
          },
          required: ['name'],
        },
        addLayer: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['music', 'rain', 'wind', 'noise', 'drone', 'pad', 'melody', 'sample'],
            },
            name: { type: 'string' },
            gain: { type: 'number' },
            params: { type: 'object', additionalProperties: true },
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
            .map((l) => `${l.name}[${l.type}${l.muted ? ', muted' : ''} ${l.gain}dB]`)
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
  const { createLayer, LAYER_TYPES } = await import('@/audio/schema');
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
        warn.push('sound has never been enabled — the user must press play in the Mood Dock first');
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
        params: { ...target.params },
      };
      for (const [k, v] of Object.entries((layerEdit.params as Record<string, unknown>) ?? {})) {
        if (
          k in next.params &&
          (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
        )
          next.params[k] = v;
      }
      await st().upsertMix({
        ...mix,
        layers: mix.layers.map((l) => (l.id === target.id ? next : l)),
      });
      done.push(`edited layer "${target.name}" (saved to "${mix.name}")`);
    }
  }
  const add = input.addLayer as Record<string, unknown> | undefined;
  if (add && typeof add.type === 'string') {
    const mix = active();
    if (!mix) warn.push('no active mix');
    else if (!(LAYER_TYPES as string[]).includes(add.type))
      warn.push(`unknown layer type "${add.type}"`);
    else {
      const layer = createLayer(add.type as (typeof LAYER_TYPES)[number], {
        ...(typeof add.name === 'string' ? { name: add.name } : {}),
        ...(typeof add.gain === 'number' ? { gain: add.gain } : {}),
        ...(add.params && typeof add.params === 'object'
          ? { params: add.params as Record<string, number | string | boolean> }
          : {}),
      });
      await st().upsertMix({ ...mix, layers: [...mix.layers, layer] });
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
    return 'set_resonance: nothing to do — give mix, volume, playing, duck, cue, layer, addLayer or removeLayer.';
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

function toolGetTheme(input: Record<string, unknown>): string {
  const section = resolvedSection();
  const preset = activePreset();
  const saved = getThemeOverrides(section);
  const preview = getThemePreview();
  const groups = groupTokens();
  const header =
    `mode: ${section}\npreset: ${preset?.name ?? 'Garden Dark'}${preset ? ` (${preset.id})` : ''}\n` +
    `saved overrides: ${Object.keys(saved).length}\npreview tokens active: ${Object.keys(preview).length}\n`;

  const wanted = typeof input.group === 'string' ? input.group.trim() : '';
  if (!wanted) {
    const list = groups
      .map(({ group, keys }) => `- ${group.id} — ${group.label}: ${keys.join(', ')}`)
      .join('\n');
    return `${header}\nGroups (call get_theme with a group id for values):\n${list}`;
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
  switch (name) {
    case 'get_theme':
      return toolGetTheme(input);
    case 'set_theme':
      return toolSetTheme(input);
    case 'set_background':
      return toolSetBackground(input, ctx);
    case 'get_resonance':
      return toolGetResonance();
    case 'set_resonance':
      return toolSetResonance(input);
    default:
      return `Unknown theme tool: ${name}`;
  }
}

/** Executor for callers with no workspace (the Keeper console). */
export function createThemeToolExecutor(ctx: ThemeToolContext = {}) {
  return (name: string, input: Record<string, unknown>) => runThemeTool(name, input, ctx);
}

/** Prompt guidance shared by the workspace chat and the Keeper. */
export const THEME_TOOL_GUIDANCE =
  '### Theme\n' +
  'You can restyle the workspace with set_theme (get_theme lists token names and groups). ' +
  'Use mode "preview" to indicate what you are doing — tint the pane you are working in, warm the accent while a long step runs — and clear it with reset: true when you finish. ' +
  'Pane border and body tokens accept CSS gradients: set e.g. paneWorkshopBorder to "linear-gradient(135deg, #00f0ff, #7cff00)" (with paneBorderWidth "3px") to show that pane is being worked on, or a solid color for a state — green done, red failed — then reset. ' +
  'Use mode "persist" only when the user asks for a lasting change to how the workspace looks. ' +
  'Never persist a change the user did not ask for. ' +
  'The soundscape is yours to signal with too: get_resonance / set_resonance — switch the mix, set volume, duck while you work (release after), play a cue. ' +
  "Layer edits rewrite the user's mix and are saved, so only make them when asked. " +
  'set_background changes what sits behind the panes: generate an image from a prompt, use a workspace image, or pick bloom/drift/flow/blank — when the user asks for a backdrop, or when a theme you are building wants one.\n\n';
