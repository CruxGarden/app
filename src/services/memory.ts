/**
 * Garden Memory (AI-COLLABORATION-V3 B6, ADR 0013).
 *
 * One `memory.md` per garden — not per crux — that the persona reads at the
 * start of every conversation for continuity across cruxes. Plain markdown
 * with a fixed skeleton (Preferences, Voice, Decisions, Notes). It is about
 * the gardener (the person), never about the persona: the persona's voice
 * lives in the Mood.
 *
 * No hidden memory (ADR 0008): the file is written only by the person (in
 * Settings → Memory, or in any editor on desktop) and by the explicit
 * `remember` tool, whose result is visible in the transcript. Nothing here
 * summarizes conversations or infers preferences.
 *
 * Storage: the garden-level settings table (sync-readable cache, the same
 * place the persona lives), mirrored on desktop as a real file at
 * `<Garden Root>/memory.md` so it can be edited outside the app. The mirror
 * is read back before each prompt build; when it differs from the cache the
 * file wins (an outside edit), so there is one truth and it is the file.
 */

import { getSetting, setSetting, removeSetting } from './settings';
import { SettingsKey } from '@/lib/constants';
import { Capability, can, type ProjectBridge } from '@/lib/platform';
import type { ToolDefinition } from '@/ai/tools';

export const MEMORY_SECTIONS = ['Preferences', 'Voice', 'Decisions', 'Notes'] as const;
export type MemorySection = (typeof MEMORY_SECTIONS)[number];

/** Where the desktop mirror lives, relative to the Garden Root. */
export const MEMORY_FILE = 'memory.md';

/** Characters of memory the prompt carries before truncating. */
export const MEMORY_PROMPT_CAP = 2000;

/** Longest note `remember` accepts. */
export const MEMORY_NOTE_MAX = 300;

const listeners = new Set<(text: string) => void>();

// ── Text shape ──────────────────────────────────────────────────────────────

/** The empty file: every section present, nothing under any of them. */
export function emptyMemory(): string {
  return MEMORY_SECTIONS.map((s) => `## ${s}\n`).join('\n');
}

/** Parse the markdown into sections; lines before the first heading and unknown headings land in Notes. */
export function parseMemory(text: string): Record<MemorySection, string[]> {
  const out = Object.fromEntries(MEMORY_SECTIONS.map((s) => [s, [] as string[]])) as Record<
    MemorySection,
    string[]
  >;
  let current: MemorySection = 'Notes';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = normalizeSection(heading[1]!) ?? 'Notes';
      continue;
    }
    if (line.trim() === '' || /^#\s/.test(line)) continue;
    out[current].push(line.trim());
  }
  return out;
}

/** Render sections back to the skeleton (stable, so equal content compares equal). */
export function renderMemory(sections: Record<MemorySection, string[]>): string {
  return MEMORY_SECTIONS.map((s) => {
    const lines = sections[s];
    return lines.length ? `## ${s}\n${lines.join('\n')}\n` : `## ${s}\n`;
  }).join('\n');
}

/** Bring any text into the skeleton: all four sections, in order, nothing lost. */
export function normalizeMemory(text: string): string {
  return renderMemory(parseMemory(text));
}

export function normalizeSection(name: string): MemorySection | null {
  const wanted = name.trim().toLowerCase();
  return MEMORY_SECTIONS.find((s) => s.toLowerCase() === wanted) ?? null;
}

/** True when no section holds a line. */
export function isMemoryEmpty(text: string): boolean {
  return Object.values(parseMemory(text)).every((lines) => lines.length === 0);
}

/** Every remembered line as (section, line) pairs, in file order — the Forget list. */
export function memoryEntries(text: string): { section: MemorySection; line: string }[] {
  const parsed = parseMemory(text);
  return MEMORY_SECTIONS.flatMap((section) => parsed[section].map((line) => ({ section, line })));
}

// ── Reading and writing ─────────────────────────────────────────────────────

/** The memory as stored (skeleton when nothing is saved). Synchronous — the prompt builder reads it. */
export function getMemory(): string {
  const raw = getSetting(SettingsKey.GardenMemory);
  return raw && raw.trim() ? normalizeMemory(raw) : emptyMemory();
}

/** Replace the memory (Settings → Memory textarea). Normalized; mirrored to disk. */
export async function setMemory(text: string): Promise<string> {
  const normalized = normalizeMemory(text);
  if (isMemoryEmpty(normalized)) removeSetting(SettingsKey.GardenMemory);
  else setSetting(SettingsKey.GardenMemory, normalized);
  for (const fn of listeners) fn(normalized);
  await writeMirror(normalized);
  return normalized;
}

/** Add one line under a section — the `remember` tool and nothing else calls this. Returns the saved line. */
export async function appendMemory(section: MemorySection, note: string): Promise<string> {
  const line = toLine(note);
  const sections = parseMemory(getMemory());
  if (!sections[section].includes(line)) sections[section].push(line);
  await setMemory(renderMemory(sections));
  return line;
}

/** Remove one remembered line (the Forget button). */
export async function forgetMemoryLine(section: MemorySection, line: string): Promise<void> {
  const sections = parseMemory(getMemory());
  sections[section] = sections[section].filter((l) => l !== line);
  await setMemory(renderMemory(sections));
}

export async function clearMemory(): Promise<void> {
  await setMemory(emptyMemory());
}

/** Subscribe to changes made through this module (Settings UI live-updates after `remember`). */
export function onMemoryChanged(fn: (text: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function toLine(note: string): string {
  const trimmed = note.trim().replace(/\s+/g, ' ');
  return trimmed.startsWith('- ') ? trimmed : `- ${trimmed}`;
}

// ── Desktop mirror ──────────────────────────────────────────────────────────

let gardenRootCache: string | null | undefined;

async function mirror(): Promise<{ api: ProjectBridge; root: string } | null> {
  if (!can(Capability.ProjectFolder)) return null;
  const api = window.electronAPI?.project;
  if (!api) return null;
  if (gardenRootCache === undefined) {
    const { getGardenRoot } = await import('./desktop');
    gardenRootCache = await getGardenRoot();
  }
  return gardenRootCache ? { api, root: gardenRootCache } : null;
}

/** Forget the cached root (the person chose a new Garden Root). */
export function resetMemoryMirror(): void {
  gardenRootCache = undefined;
}

async function writeMirror(text: string): Promise<void> {
  try {
    const m = await mirror();
    if (!m) return;
    await m.api.ensureFolder(m.root);
    await m.api.writeFile(m.root, MEMORY_FILE, new TextEncoder().encode(text));
  } catch (err) {
    console.warn('[memory] could not mirror memory.md:', err);
  }
}

/**
 * Adopt an outside edit of `<Garden Root>/memory.md` (desktop). Called before
 * each prompt build and when Settings → Memory opens. Writes the mirror when
 * it is missing and there is something to write. Never throws.
 */
export async function syncMemoryFromDisk(): Promise<string> {
  const current = getMemory();
  try {
    const m = await mirror();
    if (!m) return current;
    let onDisk: string | null = null;
    try {
      onDisk = new TextDecoder().decode(await m.api.readFile(m.root, MEMORY_FILE));
    } catch {
      onDisk = null;
    }
    if (onDisk === null) {
      if (!isMemoryEmpty(current)) await writeMirror(current);
      return current;
    }
    const normalized = normalizeMemory(onDisk);
    if (normalized === current) return current;
    // The file changed outside the app — it is the truth.
    if (isMemoryEmpty(normalized)) removeSetting(SettingsKey.GardenMemory);
    else setSetting(SettingsKey.GardenMemory, normalized);
    for (const fn of listeners) fn(normalized);
    return normalized;
  } catch (err) {
    console.warn('[memory] could not read memory.md:', err);
    return current;
  }
}

// ── Prompt rendering ────────────────────────────────────────────────────────

export const MEMORY_TRUNCATED_NOTE = '(truncated — see Settings → Memory)';

/**
 * The stable-prefix section. Always present so the model knows the tool
 * exists and what it is for; the body is the file, capped by whole lines.
 */
export function renderMemoryForPrompt(text: string = getMemory(), cap = MEMORY_PROMPT_CAP): string {
  const lines = [
    '## What you know about this gardener',
    'Garden Memory — notes the person chose to keep across every crux (their preferences, voice, decisions). It is about them, not you; your own voice comes from Identity. ' +
      'When they ask you to remember something, or state a durable preference, call remember(section, note); it is saved to this file and they see it. ' +
      'Never write memory any other way, and never infer or summarize it from conversation.',
  ];
  if (isMemoryEmpty(text)) {
    lines.push('', 'Nothing remembered yet.');
    return lines.join('\n');
  }
  const body = normalizeMemory(text).trimEnd();
  if (body.length <= cap) {
    lines.push('', body);
    return lines.join('\n');
  }
  const kept: string[] = [];
  let size = 0;
  for (const line of body.split('\n')) {
    if (size + line.length + 1 > cap) break;
    kept.push(line);
    size += line.length + 1;
  }
  lines.push('', kept.join('\n').trimEnd(), MEMORY_TRUNCATED_NOTE);
  return lines.join('\n');
}

// ── The tool ────────────────────────────────────────────────────────────────

export const MEMORY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'remember',
    description:
      'Save one line to Garden Memory — what you know about this person across every crux. ' +
      'USE WHEN: The person asks you to remember something, or states a durable preference, their voice, or a decision that should hold in future conversations. ' +
      'DO NOT USE for facts about the current crux or task (those belong in the files), or for anything they did not say. ' +
      'The line is shown to them and is editable in Settings → Memory.',
    input_schema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: [...MEMORY_SECTIONS],
          description:
            'Preferences (how they like things done), Voice (how they write and want to be written for), Decisions (choices that should hold), Notes (anything else durable).',
        },
        note: {
          type: 'string',
          description: `One short line, in their words where possible. At most ${MEMORY_NOTE_MAX} characters.`,
        },
      },
      required: ['section', 'note'],
      additionalProperties: false,
    },
  },
];

export const REMEMBERED_PREFIX = 'Remembered';

/** Execute `remember` (input already validated). The result is what the transcript shows. */
export async function runMemoryTool(input: Record<string, unknown>): Promise<string> {
  const section = normalizeSection(String(input.section))!;
  const line = await appendMemory(section, String(input.note));
  return `${REMEMBERED_PREFIX} (${section}): ${line.replace(/^- /, '')}`;
}
