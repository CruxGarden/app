import { BROWSER_TOOL, runBrowserTool } from './browser-tools';
import { WORKSPACE_LAYOUT_TOOL, runWorkspaceLayouts } from './layout-tools';
import { APP_TYPOGRAPHY } from '@/lib/moods/typography';
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
import { groupTokens, tokenKind, tokenLabel, tokenChoices } from '@/lib/moods/token-groups';
import type { ToolDefinition } from './tools';
import type { ToolResultContent } from '@/services/types';

export const THEME_TOOL_NAMES = [
  'workspace_layouts',
  'browser',
  'get_synth',
  'set_synth',
  'set_theme',
  'get_theme',
  'set_background',
  'list_cue_presets',
  'set_cue',
] as const;

export const THEME_TOOL_DEFINITIONS: ToolDefinition[] = [
  WORKSPACE_LAYOUT_TOOL,
  BROWSER_TOOL,
  {
    name: 'get_synth',
    description:
      'Read Crux Synth, its four tracks and available presets. These are the same controls in Mood → Sound. Read before making sounds.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'set_synth',
    description:
      'Make or adjust evolving ambient sound with the same controls as Mood → Sound. Supply a preset and/or full patch (exactly four tracks); changes persist and remain editable. Never generate code or bypass these controls. Playback starts only after the person has opted into sound. Only change sound when asked.',
    input_schema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'Preset id from get_synth.' },
        patch: {
          type: 'object',
          description:
            'Full patch: {version:1,name,root:36..72,tracks:[{voice:pad|bass|bell|air,level:0..1,tone:0..1,movement:0..1,muted:boolean} ×4]}. Also mode:major|minor|dorian, tempo:30..100, space:0..1 (older patches get defaults). Root is MIDI; tone is brightness; movement controls note density.',
        },
        savePreset: {
          type: 'string',
          description:
            'Save the resulting sound under this name in the current Mood (same name replaces it). Travels with saved/exported/shared Moods.',
        },
        removePreset: {
          type: 'string',
          description: 'Remove the named preset from the current Mood when requested.',
        },
        volume: { type: 'number', minimum: 0, maximum: 1 },
        enabled: { type: 'boolean' },
        playing: { type: 'boolean' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_cue_presets',
    description:
      'List the Sound Cue presets the Mood can play on events (reply, tool finished, snapshot, shared, failed), grouped by register (classic, garden, 8-bit, office, plasma, bare), and what each event plays now. ' +
      'USE WHEN: before set_cue, or when the person asks what the app sounds like.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'set_cue',
    description:
      'Choose what the Mood plays on an event: a preset id from list_cue_presets, a patch of your own (a small synth description: voices with wave, notes, onsets, hold, attack, release, level; optional filter, delay, bitcrush; gain), or null for silence. ' +
      'This is a lasting change to the Mood, exactly like Mood → Sound: only when the person asked for it. ' +
      'try: true plays the cue once so they can hear it (only after they have turned sound on).',
    input_schema: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          enum: ['message', 'toolDone', 'snapshot', 'published', 'error', 'alert'],
          description: 'Which event.',
        },
        preset: { type: 'string', description: 'A preset id from list_cue_presets.' },
        patch: {
          type: 'object',
          description:
            'Your own cue: { version: 1, name, voices: [{ wave: sine|triangle|square|sawtooth|noise, notes: ["E5","B5"], at: [0, 0.08], dur, attack, release, level }], filter?: { type, hz, q }, fx?: { delay?: { time, feedback, mix }, reverb?: { seconds, mix }, bitcrush? }, gain }. Seconds, levels 0..1, three seconds at most.',
        },
        silent: { type: 'boolean', description: 'true to play nothing on this event.' },
        try: { type: 'boolean', description: 'Play it once now.' },
      },
      required: ['event'],
      additionalProperties: false,
    },
  },
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
  return (
    (APP_TYPOGRAPHY as Record<string, string>)[key] ??
    preview[key] ??
    saved[key] ??
    activePreset()?.overrides[key] ??
    base[key] ??
    ''
  );
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
      `${header}\n## Assets (${list.length})\nUse an asset as a token value with asset:<fingerprint> — textures (workspaceTexture, pane*Texture), or set_background {path}.\n\n` +
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
      const choices = tokenChoices(k);
      const kind = choices ? `one of ${choices.join('|')}` : tokenKind(k);
      return `${k} (${kind}, ${tokenLabel(k, found.group)}): ${effectiveValue(k, saved, preview)}${flag}`;
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
  const invalid: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in GARDEN_DARK)) unknown.push(k);
    else if (!reset && k in APP_TYPOGRAPHY && v !== (APP_TYPOGRAPHY as Record<string, string>)[k])
      invalid.push(
        `${k} is fixed by the app typography: Outfit for headings, Inter for content, JetBrains Mono for code, Garamond for the wordmark`,
      );
    else if (typeof v === 'string' && v.trim()) {
      const choices = tokenChoices(k);
      if (choices && !choices.includes(v.trim()))
        invalid.push(`${k} must be one of ${choices.join('|')} (got "${v.trim()}")`);
      else tokens[k] = v.trim();
    }
  }
  if ((unknown.length || invalid.length) && Object.keys(tokens).length === 0 && !reset) {
    return `set_theme: ${[
      unknown.length ? `unknown token(s): ${unknown.join(', ')}` : '',
      ...invalid,
    ]
      .filter(Boolean)
      .join('; ')}. Call get_theme to list valid names and options.`;
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
  const notes = [
    unknown.length ? `Ignored unknown token(s): ${unknown.join(', ')}.` : '',
    invalid.length ? `Ignored: ${invalid.join('; ')}.` : '',
  ].filter(Boolean);
  return notes.length ? `${summary}\n${notes.join('\n')}` : summary;
}

/** Execute a theme tool. Safe without a DOM (state updates, no paint). */
export async function runThemeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ThemeToolContext = {},
): Promise<string | ToolResultContent> {
  try {
    switch (name) {
      case 'browser':
        return await runBrowserTool(input, ctx.cruxId);
      case 'workspace_layouts':
        return await runWorkspaceLayouts(input, ctx.cruxId);
      case 'get_synth':
      case 'set_synth':
        return await toolSynth(name, input);
      case 'get_theme':
        return await toolGetTheme(input);
      case 'set_theme':
        return toolSetTheme(input);
      case 'set_background':
        return await toolSetBackground(input, ctx);
      case 'list_cue_presets':
        return await toolListCuePresets();
      case 'set_cue':
        return await toolSetCue(input);
      default:
        return `Unknown theme tool: ${name}`;
    }
  } catch (err) {
    // A tool must report, never throw into the model loop (an engine error is not a chat error).
    console.warn(`[theme-tools] ${name} failed`, err);
    return `${name}: failed — ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolListCuePresets(): Promise<string> {
  const { CUE_PRESETS, CUE_GROUPS } = await import('@/audio/cue-presets');
  const { getCues, CUE_EVENTS, cueLabel } = await import('@/services/cues');
  const cues = getCues();
  const lines = ['Now playing:'];
  for (const ev of CUE_EVENTS) lines.push(`  ${ev.id} (${ev.label}): ${cueLabel(cues[ev.id])}`);
  lines.push('', 'Presets:');
  for (const g of CUE_GROUPS) {
    const ids = CUE_PRESETS.filter((p) => p.group === g.id).map((p) => `${p.id} (${p.name})`);
    if (ids.length) lines.push(`  ${g.label}: ${ids.join(', ')}`);
  }
  return lines.join('\n');
}

async function toolSetCue(input: Record<string, unknown>): Promise<string> {
  const { getCues, saveCues, CUE_EVENTS, cueLabel, parseCueChoice, playCue } =
    await import('@/services/cues');
  const { parseCuePatch } = await import('@/audio/cue-synth');
  const event = input.event as (typeof CUE_EVENTS)[number]['id'];
  if (!CUE_EVENTS.some((e) => e.id === event))
    return `set_cue: event must be one of ${CUE_EVENTS.map((e) => e.id).join(', ')}`;
  let choice: ReturnType<typeof parseCueChoice>;
  if (input.silent === true) choice = null;
  else if (typeof input.preset === 'string') {
    choice = parseCueChoice(input.preset);
    if (!choice) return `set_cue: no preset named "${input.preset}" — list_cue_presets shows them`;
  } else if (input.patch && typeof input.patch === 'object') {
    try {
      choice = parseCuePatch(input.patch);
    } catch (err) {
      return `set_cue: the patch is not playable — ${err instanceof Error ? err.message : String(err)}`;
    }
  } else return 'set_cue: give a preset id, a patch, or silent: true';
  const next = { ...getCues(), [event]: choice };
  saveCues(next);
  if (input.try === true && choice) await playCue(event);
  return `${event} now plays ${cueLabel(choice)}.`;
}

/** Executor for callers with no workspace (the Keeper console). */
export function createThemeToolExecutor(ctx: ThemeToolContext = {}) {
  return (name: string, input: Record<string, unknown>) => runThemeTool(name, input, ctx);
}

/** Prompt guidance shared by the workspace chat and the Keeper. */
export const THEME_TOOL_GUIDANCE =
  '### Theme\n' +
  'Crux Synth makes evolving ambient sound through four tracks. Use get_synth then set_synth to make sounds with the provided voice, level, brightness, movement, mute and root-note controls. Never substitute generated audio code; these controls must remain editable in Mood → Sound and travel with a saved Mood. ' +
  'You can restyle every part of the workspace with set_theme (get_theme lists the 25 token groups and every token name; get_theme {group} shows current values). ' +
  'Beyond colors there are tokens for shape and state: per-component radii (buttonRadius, inputRadius, cardRadius, chipRadius, tooltipRadius, dropdownRadius, bubbleRadius, meterRadius, paneRadius, paneHeaderRadius), ' +
  'shadows (elevationPanel/Card/CardHover/Modal/Dropdown/Tooltip, moodBarShadow), focus (focusRing, focusRingWidth, focusRingOffset), hover/active/disabled (hoverBrightness, activeBrightness, disabledOpacity, paneHeaderHoverBrightness, cardHoverLift, every *Hover / *Active token), ' +
  'sizes (toolbarHeight, paneHeaderHeight, paneGap, density, fontScale, fileTreeRowHeight, toggleWidth/Height, scrollbarWidth, meterHeight), textures (asset: tokens). ' +
  'Every visible element — buttons, inputs, toggles, chips, tooltips, dropdowns, cards, chat bubbles, markdown, code, file tree, top bar, mood bar, scrollbars, selection, each pane — has its own family; when the user describes a look, change the specific families rather than only foundation colors. ' +
  'Use mode "preview" to indicate what you are doing — tint the pane you are working in, warm the accent while a long step runs — and clear it with reset: true when you finish. ' +
  'Pane border and body tokens accept CSS gradients: set e.g. paneWorkshopBorder to "linear-gradient(135deg, #00f0ff, #7cff00)" (with paneBorderWidth "3px") to show that pane is being worked on, or a solid color for a state — green done, red failed — then reset. ' +
  'Use mode "persist" only when the user asks for a lasting change to how the workspace looks. ' +
  'Sound Cues are part of the Mood too: list_cue_presets shows the bank and what each event plays; set_cue changes one event to a preset, a patch of your own, or silence — a lasting change, so only when asked; try: true lets them hear it. ' +
  'Never persist a change the user did not ask for. ' +
  "Edits to an existing mix (layer, updateMix) rewrite the user's mix and are saved, so only make them when asked. " +
  'set_background changes what sits behind the panes: generate an image from a prompt, use a workspace image, or pick bloom/drift/flow/blank — when the user asks for a backdrop, or when a theme you are building wants one.\n\n';

async function toolSynth(name: string, input: Record<string, unknown>): Promise<string> {
  const { useAudioStore } = await import('@/stores/audioStore');
  const { SYNTH_PRESETS, parseSynthPatch, parseSynthPresets, synthPreset } =
    await import('@/audio/synth-patch');
  const store = useAudioStore.getState();
  store.init();
  const moodPresets = useAudioStore.getState().synthPresets;
  const presets = {
    ...SYNTH_PRESETS,
    ...Object.fromEntries(moodPresets.map((p, i) => [`mood:${i}`, p])),
  };
  if (name === 'set_synth') {
    const patch =
      input.patch !== undefined
        ? parseSynthPatch(input.patch)
        : typeof input.preset === 'string'
          ? presets[input.preset]
            ? parseSynthPatch(presets[input.preset])
            : synthPreset(input.preset)
          : undefined;
    if (
      input.volume !== undefined &&
      (typeof input.volume !== 'number' ||
        !Number.isFinite(input.volume) ||
        input.volume < 0 ||
        input.volume > 1)
    )
      throw new Error('volume must be 0..1');
    for (const key of ['enabled', 'playing'])
      if (input[key] !== undefined && typeof input[key] !== 'boolean')
        throw new Error(`${key} must be boolean`);
    let updatedPresets = moodPresets;
    if (input.removePreset !== undefined) {
      if (typeof input.removePreset !== 'string') throw new Error('removePreset must be a name');
      updatedPresets = updatedPresets.filter((p) => p.name !== input.removePreset);
    }
    if (input.savePreset !== undefined) {
      if (typeof input.savePreset !== 'string') throw new Error('savePreset must be a name');
      const saved = parseSynthPatch({
        ...(patch ?? useAudioStore.getState().synth),
        name: input.savePreset,
      });
      updatedPresets = parseSynthPresets([
        ...updatedPresets.filter((p) => p.name !== saved.name),
        saved,
      ]);
    }
    if (input.playing === true && !useAudioStore.getState().optIn)
      return 'Press Play synth in Mood → Sound once to enable sound before an agent can play it.';
    if (patch) await store.setSynth(patch);
    if (updatedPresets !== moodPresets) store.setSynthPresets(updatedPresets);
    if (typeof input.volume === 'number') store.setVolume(input.volume);
    if (typeof input.enabled === 'boolean') store.setEnabled(input.enabled);
    if (input.playing === true) await store.play();
    else if (input.playing === false) store.pause();
  }
  const state = useAudioStore.getState();
  return JSON.stringify({
    patch: state.synth,
    volume: state.volume,
    enabled: state.enabled,
    playing: state.playing,
    presets: {
      ...SYNTH_PRESETS,
      ...Object.fromEntries(state.synthPresets.map((p, i) => [`mood:${i}`, p])),
    },
    moodPresets: state.synthPresets,
  });
}
