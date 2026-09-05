/**
 * Growth tools — history as an API (AI-COLLABORATION-V3 B0, ADR 0013).
 *
 * `snapshot`, `list_snapshots`, `restore`, `branch`, `diff` over the Growth
 * module. One implementation for every agent: the built-in collaborator calls
 * these through the tool executor, and the MCP server (B2) calls the same
 * executor with `requestedBy: 'agent:<name>'`. The host that actually runs
 * the operation is resolved per call (`growthHostFor`): the open workspace's
 * store when the crux is loaded in the app, else the headless service path.
 *
 * `restore` and `branch` change files — they are in MUTATING_TOOLS so the
 * workspace context refreshes and the Artifacts panel reloads. `snapshot`,
 * `list_snapshots` and `diff` do not.
 */
import type { ToolDefinition } from './tools';
import { formatToolError } from './errors';
import {
  growthHostFor,
  diffIsEmpty,
  UnknownSnapshotError,
  type SnapshotInfo,
  type SnapshotDiff,
  type RestoreReport,
} from '@/services/growth';

export const GROWTH_TOOL_NAMES = [
  'snapshot',
  'list_snapshots',
  'restore',
  'branch',
  'diff',
] as const;
export type GrowthToolName = (typeof GROWTH_TOOL_NAMES)[number];

export function isGrowthTool(name: string): name is GrowthToolName {
  return (GROWTH_TOOL_NAMES as readonly string[]).includes(name);
}

const SNAPSHOT_REF =
  'A snapshot id from list_snapshots or a previous snapshot result, "#N" (its position in the timeline, 1-based), or "latest".';

export const GROWTH_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'snapshot',
    description:
      'Record a Growth snapshot of the workspace as it is right now — every file plus the conversation so far — and return its id. ' +
      'USE WHEN: before a risky or multi-file change (a checkpoint you can restore), after finishing a coherent piece of work, or when the user asks to save a version. ' +
      'Snapshots are cheap (metadata only) and appear in the Growth timeline with the label you give them. ' +
      'The app also snapshots automatically after a turn that changed files; if you already snapshotted at the end of your work, the automatic one is skipped.',
    input_schema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description:
            'Short label shown in the timeline, e.g. "Before restyling the header". Optional.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_snapshots',
    description:
      "List the crux's Growth snapshots (oldest first): id, position, label, summary, when, and parent. " +
      'USE WHEN: You need a snapshot id for restore, branch or diff, or the user asks about history.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'Only the most recent N snapshots. Default: 20.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'restore',
    description:
      "Restore the workspace files to a snapshot's state. A safety snapshot of the current state is taken first, so nothing is lost. " +
      'The conversation continues from the restored snapshot. ' +
      'USE WHEN: A change broke the site (check_site fails, the preview is wrong) and fixing forward is worse than going back, or the user asks to undo to a version. ' +
      'Returns what changed (files added, removed, modified).',
    input_schema: {
      type: 'object',
      properties: {
        snapshotId: { type: 'string', description: SNAPSHOT_REF },
      },
      required: ['snapshotId'],
      additionalProperties: false,
    },
  },
  {
    name: 'branch',
    description:
      'Start a new Growth branch from a snapshot: the files are restored to that point and later snapshots chain from it, while the current line of work stays in history. A safety snapshot is taken first. ' +
      'USE WHEN: The user wants to try a different direction from an earlier version without losing the current one.',
    input_schema: {
      type: 'object',
      properties: {
        snapshotId: { type: 'string', description: SNAPSHOT_REF },
        label: {
          type: 'string',
          description: 'Name for the branch point, e.g. "Try a dark layout".',
        },
      },
      required: ['snapshotId', 'label'],
      additionalProperties: false,
    },
  },
  {
    name: 'diff',
    description:
      'Compare two snapshots — or a snapshot against the current working files — and list files added, removed and modified (paths and sizes; use read_file for contents). ' +
      'USE WHEN: Before restoring, to see what would be lost; or to explain what changed between versions.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: `The older snapshot. ${SNAPSHOT_REF}` },
        to: {
          type: 'string',
          description: `The newer snapshot. ${SNAPSHOT_REF} Omit to compare against the current working files.`,
        },
      },
      required: ['from'],
      additionalProperties: false,
    },
  },
];

/** Growth tools that change workspace files. */
export const MUTATING_GROWTH_TOOLS = ['restore', 'branch'];

export interface GrowthToolContext {
  cruxId: string;
  /** Who is calling — stamped on every snapshot taken (ADR 0013 attribution). */
  requestedBy: string;
}

export async function runGrowthTool(
  toolName: GrowthToolName,
  input: Record<string, unknown>,
  ctx: GrowthToolContext,
): Promise<string> {
  const host = await growthHostFor(ctx.cruxId);
  const actor = { requestedBy: ctx.requestedBy };
  try {
    switch (toolName) {
      case 'snapshot': {
        const label = typeof input.label === 'string' ? input.label.trim() || undefined : undefined;
        const info = await host.snapshot({ label, ...actor });
        return `Snapshot #${info.number} recorded.\n${describeSnapshot(info)}`;
      }
      case 'list_snapshots': {
        const limit = typeof input.limit === 'number' ? input.limit : 20;
        const infos = await host.list(limit);
        if (infos.length === 0) return 'No snapshots yet. Call snapshot to record the first one.';
        return infos.map(describeSnapshotLine).join('\n');
      }
      case 'restore': {
        const report = await host.restore(input.snapshotId as string, actor);
        return describeRestore('Restored the workspace to', report);
      }
      case 'branch': {
        const report = await host.branch(input.snapshotId as string, input.label as string, actor);
        return describeRestore(`Branched as "${input.label as string}" from`, report);
      }
      case 'diff': {
        const changes = await host.diff(input.from as string, input.to as string | undefined);
        const target = input.to ? `snapshot ${input.to as string}` : 'the current working files';
        if (diffIsEmpty(changes))
          return `No file differences between ${input.from as string} and ${target}.`;
        return `Changes from ${input.from as string} to ${target}:\n${describeDiff(changes)}`;
      }
    }
  } catch (err: unknown) {
    if (err instanceof UnknownSnapshotError) return formatToolError(toolName, err.message);
    return formatToolError(toolName, err as Error);
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────

function describeSnapshot(info: SnapshotInfo): string {
  const lines = [`id: ${info.id}`];
  if (info.label) lines.push(`label: ${info.label}`);
  if (info.summary) lines.push(`summary: ${info.summary}`);
  lines.push(`when: ${info.when}`);
  lines.push(`parent: ${info.parentId ?? 'none'}`);
  return lines.join('\n');
}

function describeSnapshotLine(info: SnapshotInfo): string {
  const parts = [`#${info.number} ${info.id}`];
  parts.push(info.label ? `"${info.label}"` : '(no label)');
  if (info.summary) parts.push(`— ${info.summary}`);
  parts.push(`— ${info.when}`);
  parts.push(`— parent ${info.parentId ?? 'none'}`);
  if (info.requestedBy) parts.push(`— by ${info.requestedBy}`);
  return parts.join(' ');
}

const MAX_LISTED = 40;

export function describeDiff(d: SnapshotDiff): string {
  const lines: string[] = [];
  const section = (
    title: string,
    items: { path: string; size: number; previousSize?: number }[],
  ) => {
    if (items.length === 0) return;
    lines.push(`${title} (${items.length}):`);
    for (const f of items.slice(0, MAX_LISTED)) {
      const size =
        f.previousSize !== undefined ? `${f.previousSize} → ${f.size} bytes` : `${f.size} bytes`;
      lines.push(`  ${f.path} (${size})`);
    }
    if (items.length > MAX_LISTED) lines.push(`  … ${items.length - MAX_LISTED} more`);
  };
  section('Added', d.added);
  section('Removed', d.removed);
  section('Modified', d.modified);
  return lines.join('\n');
}

function describeRestore(verb: string, report: RestoreReport): string {
  const { target, safety, changes } = report;
  const lines = [
    `${verb} snapshot #${target.number}${target.label ? ` "${target.label}"` : ''} (${target.id}).`,
  ];
  lines.push(
    safety
      ? `Safety snapshot #${safety.number} "${safety.label ?? ''}" (${safety.id}) holds the state from before this operation.`
      : 'Warning: the safety snapshot could not be taken; the previous state is not recoverable from history.',
  );
  lines.push(
    diffIsEmpty(changes)
      ? 'Files were already identical; nothing changed on disk.'
      : `Files changed: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.modified.length} modified.\n${describeDiff(changes)}`,
  );
  lines.push(
    'The file list in your workspace context has been refreshed; re-read any file before editing it.',
  );
  return lines.join('\n');
}
