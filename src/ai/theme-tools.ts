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

export const THEME_TOOL_NAMES = ['set_theme', 'get_theme', 'set_background'] as const;

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
  'set_background changes what sits behind the panes: generate an image from a prompt, use a workspace image, or pick bloom/drift/flow/blank — when the user asks for a backdrop, or when a theme you are building wants one.\n\n';
