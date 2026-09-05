import type { ToolDefinition } from './tools';
import type { WriteScope } from '@/lib/write-scope';
import { canonicalScopePath, normalizeScope } from '@/lib/write-scope';

/**
 * `delegate` — the model fans wide, independent work out to Subagents
 * (AI-COLLABORATION-V3 B5, ADR 0013). Each task runs on its own Growth branch
 * with its own write scope; the app merges the branches back and the tool
 * result is that merge summary. The runner lives in `services/subagents.ts`
 * and the wiring in `services/delegate.ts`; this file is the tool's face:
 * definition and input validation, both pure.
 */

export const MAX_DELEGATE_TASKS = 6;
export const MAX_TASK_PATHS = 200;
const MAX_TITLE = 60;
const MAX_INSTRUCTIONS = 6000;

export interface DelegateTaskInput {
  title: string;
  instructions: string;
  scope: WriteScope;
}

export const DELEGATE_TOOL_DEFINITION: ToolDefinition = {
  name: 'delegate',
  description:
    'Split wide, independent work across parallel workers. Each task runs on its own Growth branch and may only change the files (or folder) you give it; the app merges the branches back — files changed by one task apply, files changed by two or more are shown to the person to decide — and records one "Merged N subagents" snapshot. The result summarizes what merged and what needs a decision. ' +
    'USE WHEN: the same kind of change touches many files that do not depend on each other — captions for a batch of photos, translating a set of pages, one post per item. ' +
    'DO NOT USE for one file, for work where step two depends on step one, or for anything that needs a question answered first. Never give two tasks the same file unless a conflict is acceptable. ' +
    `Maximum ${MAX_DELEGATE_TASKS} tasks; group files into batches rather than one task per file.`,
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_DELEGATE_TASKS,
        description: 'The independent tasks to run in parallel.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short name shown to the person, e.g. "Captions 1–10".',
            },
            instructions: {
              type: 'string',
              description:
                'What this worker should do, complete in itself — it does not see this conversation. Name the files, the format, the voice.',
            },
            paths: {
              type: 'array',
              items: { type: 'string' },
              description:
                'The exact files this worker may create or change (relative paths). Writes to any other file are refused.',
            },
            folder: {
              type: 'string',
              description:
                'A folder this worker may write anywhere under (relative path). Use instead of, or in addition to, paths.',
            },
          },
          required: ['title', 'instructions'],
          additionalProperties: false,
        },
      },
    },
    required: ['tasks'],
    additionalProperties: false,
  },
};

export type DelegateValidation =
  | { valid: true; tasks: DelegateTaskInput[] }
  | { valid: false; error: string };

/** Validate and normalize a `delegate` call. Pure. */
export function validateDelegateInput(input: Record<string, unknown>): DelegateValidation {
  const raw = input.tasks;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      valid: false,
      error: 'tasks must be a non-empty array of { title, instructions, paths?, folder? }.',
    };
  }
  if (raw.length > MAX_DELEGATE_TASKS) {
    return {
      valid: false,
      error: `Too many tasks (${raw.length}); the maximum is ${MAX_DELEGATE_TASKS}. Group the files into fewer, larger batches.`,
    };
  }
  const tasks: DelegateTaskInput[] = [];
  const titles = new Set<string>();
  for (const [i, item] of raw.entries()) {
    const at = `tasks[${i}]`;
    if (!item || typeof item !== 'object')
      return { valid: false, error: `${at} must be an object.` };
    const t = item as Record<string, unknown>;
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    if (!title) return { valid: false, error: `${at}.title is required.` };
    if (title.length > MAX_TITLE) {
      return { valid: false, error: `${at}.title is too long (max ${MAX_TITLE} characters).` };
    }
    if (titles.has(title.toLowerCase())) {
      return { valid: false, error: `Task titles must be unique — "${title}" appears twice.` };
    }
    titles.add(title.toLowerCase());
    const instructions = typeof t.instructions === 'string' ? t.instructions.trim() : '';
    if (!instructions) return { valid: false, error: `${at}.instructions is required.` };
    if (instructions.length > MAX_INSTRUCTIONS) {
      return {
        valid: false,
        error: `${at}.instructions is too long (max ${MAX_INSTRUCTIONS} characters).`,
      };
    }
    let paths: string[] | undefined;
    if (t.paths !== undefined) {
      if (!Array.isArray(t.paths) || t.paths.some((p) => typeof p !== 'string')) {
        return { valid: false, error: `${at}.paths must be an array of strings.` };
      }
      if (t.paths.length > MAX_TASK_PATHS) {
        return { valid: false, error: `${at}.paths lists too many files (max ${MAX_TASK_PATHS}).` };
      }
      paths = (t.paths as string[]).map(canonicalScopePath).filter(Boolean);
      if (paths.some((p) => p.includes('\0'))) {
        return { valid: false, error: `${at}.paths contains an invalid path.` };
      }
    }
    let folder: string | undefined;
    if (t.folder !== undefined) {
      if (typeof t.folder !== 'string')
        return { valid: false, error: `${at}.folder must be a string.` };
      folder = canonicalScopePath(t.folder) || undefined;
    }
    const scope = normalizeScope({ paths, folder });
    if (!scope.paths && !scope.folder) {
      return {
        valid: false,
        error: `${at} needs a scope: list the files in paths and/or name a folder. A worker with no scope cannot change anything.`,
      };
    }
    tasks.push({ title, instructions, scope });
  }
  return { valid: true, tasks };
}
