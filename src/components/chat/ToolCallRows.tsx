/* eslint-disable react-refresh/only-export-components -- the label table and the rows belong together */
import { useState } from 'react';
import type { ToolCall } from '@/api/types';
import { cn } from '@/lib/cn';

/**
 * The tool calls under a reply. One call is one row; several fold into a
 * single line — "Created 2 files · Ran 1 command ›" — that opens to the rows,
 * so a reply reads as prose with its work tucked beneath it (Daniel,
 * 2026-09-20: "our collaboration should be this nice looking"). A group with
 * a failed call starts open: the red row is the point.
 */

/** The last two path segments — Claude Code's tools speak in absolute paths. */
function shortPath(v: unknown): string {
  const parts = String(v ?? '')
    .split('/')
    .filter(Boolean);
  return parts.slice(-2).join('/');
}

export function getToolLabel(tc: ToolCall): string {
  switch (tc.name) {
    case 'write_file':
      return `Wrote ${String(tc.input?.path ?? '')}`;
    case 'edit_file':
      return `Edited ${String(tc.input?.path ?? '')}`;
    case 'read_file':
      return `Read ${String(tc.input?.path ?? '')}`;
    case 'delete_file':
      return `Deleted ${String(tc.input?.path ?? '')}`;
    case 'list_files':
      return 'Listed files';
    case 'set_palette':
      return 'Applied palette';
    case 'get_palette':
      return 'Read palette';
    case 'generate_image':
      return `Generated ${String(tc.input?.path ?? 'image')}`;
    case 'rename_file':
      return `Renamed ${String(tc.input?.old_path ?? '')} → ${String(tc.input?.new_path ?? '')}`;
    case 'search_files':
      return `Searched for ${String(tc.input?.query ?? '')}`;
    case 'check_site':
      return 'Checked the build';
    case 'snapshot':
      return tc.input?.label ? `Snapshot "${String(tc.input.label)}"` : 'Took a snapshot';
    case 'list_snapshots':
      return 'Listed snapshots';
    case 'restore':
      return `Restored snapshot ${String(tc.input?.snapshotId ?? '')}`;
    case 'branch':
      return tc.input?.label
        ? `Branched "${String(tc.input.label)}"`
        : `Branched from ${String(tc.input?.snapshotId ?? '')}`;
    case 'diff':
      return 'Compared snapshots';
    case 'remember':
      return `Remembered ${String(tc.input?.section ?? 'a note')}`;
    case 'load_skill':
      return `Loaded skill ${String(tc.input?.name ?? '')}`;
    // Claude Code's own tools (Agent Provider, ADR 0019)
    case 'Read':
      return `Read ${shortPath(tc.input?.file_path)}`;
    case 'Write':
      return `Wrote ${shortPath(tc.input?.file_path)}`;
    case 'Edit':
    case 'MultiEdit':
      return `Edited ${shortPath(tc.input?.file_path)}`;
    case 'NotebookEdit':
      return `Edited ${shortPath(tc.input?.notebook_path)}`;
    case 'Bash':
      return `Ran ${String(tc.input?.command ?? '').slice(0, 80)}`;
    case 'Glob':
      return `Found files ${String(tc.input?.pattern ?? '')}`;
    case 'Grep':
      return `Searched for ${String(tc.input?.pattern ?? '')}`;
    case 'WebFetch':
      return `Fetched ${String(tc.input?.url ?? '')}`;
    case 'WebSearch':
      return `Searched the web for ${String(tc.input?.query ?? '')}`;
    case 'Task':
      return `Delegated: ${String(tc.input?.description ?? '')}`;
    // The Keeper's garden tools (garden-tools.ts)
    case 'list_cruxes':
      return 'Looked over the garden';
    case 'list_cruxspaces':
      return 'Listed the Cruxspaces';
    case 'create_cruxspace':
      return `Gathered a Cruxspace: ${String(tc.input?.name ?? '')}`;
    case 'plant_crux':
      return `Planted ${String(tc.input?.title ?? 'a crux')}`;
    case 'run_turn':
      return `Ran a turn in a crux: ${String(tc.input?.message ?? '').slice(0, 60)}`;
    case 'publish_crux':
      return 'Published a crux';
    case 'install_tool':
      return `Installed ${String(tc.input?.slug ?? tc.input?.cruxId ?? 'a tool')}`;
    case 'show': {
      const what = String(tc.input?.what ?? '');
      if (what === 'pane') return `Showed the ${String(tc.input?.pane ?? '')} pane`;
      if (what === 'file') return `Showed ${String(tc.input?.path ?? 'a file')}`;
      if (what === 'crux')
        return `Showed ${String(tc.input?.title ?? tc.input?.cruxId ?? 'a crux')}`;
      return `Showed ${what || 'the garden'}`;
    }
    case 'read_crux':
      return `Read ${String(tc.input?.title ?? tc.input?.cruxId ?? 'a crux')}`;
    case 'snapshot_crux':
      return `Snapshot: ${String(tc.input?.label ?? '')}`;
    case 'set_names':
      return 'Named the garden';
    case 'list_moods':
      return 'Looked over the Moods';
    case 'wear_mood':
      return `Wore the ${String(tc.input?.id ?? '')} Mood`;
    case 'ToolSearch':
      return 'Looked up a tool';
    case 'ListMcpResourcesTool':
      return 'Listed resources';
    case 'mcp__crux_garden__garden_search_tools':
      return `Searched the garden's tools for ${String(tc.input?.query ?? '')}`;
    case 'mcp__crux_garden__garden_call_tool':
      return `Used ${String(tc.input?.name ?? 'a garden tool')}`;
    case 'TodoWrite':
      return 'Updated the plan';
    default:
      return tc.name.startsWith('mcp__') ? tc.name.split('__').slice(-1)[0]! : tc.name;
  }
}

/** True when the producer said so, or the record predates that and says "Error:". */
export function isToolError(tc: ToolCall): boolean {
  return tc.error ?? /^(Error|ERROR)\b/.test(tc.result ?? '');
}

type Verb = 'created' | 'edited' | 'read' | 'ran' | 'used';
const VERBS: Record<string, Verb> = {
  write_file: 'created',
  generate_image: 'created',
  Write: 'created',
  edit_file: 'edited',
  rename_file: 'edited',
  delete_file: 'edited',
  Edit: 'edited',
  MultiEdit: 'edited',
  read_file: 'read',
  list_files: 'read',
  search_files: 'read',
  Read: 'read',
  Glob: 'read',
  Grep: 'read',
  Bash: 'ran',
};

/** "Created 2 files · Ran 1 command" — what a group of calls amounts to. */
export function summarizeToolCalls(calls: ToolCall[]): string {
  const counts = new Map<Verb, number>();
  for (const tc of calls) {
    const verb = VERBS[tc.name] ?? 'used';
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  const noun = (verb: Verb, n: number) => {
    const word = verb === 'ran' ? 'command' : verb === 'used' ? 'tool' : 'file';
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  };
  const order: Verb[] = ['created', 'edited', 'read', 'ran', 'used'];
  return order
    .filter((v) => counts.has(v))
    .map((v) => `${v[0]!.toUpperCase()}${v.slice(1)} ${noun(v, counts.get(v)!)}`)
    .join(' · ');
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={cn('shrink-0 transition-transform', open && 'rotate-90')}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = getToolLabel(tc);
  const hasResult = !!tc.result;
  const isError = isToolError(tc);

  return (
    <div>
      <button
        onClick={() => hasResult && setExpanded((v) => !v)}
        data-testid="tool-call"
        data-error={isError ? 'true' : 'false'}
        className={cn(
          'text-xs font-mono rounded px-1.5 py-0.5 flex items-center gap-1.5 w-full text-left transition-colors',
          hasResult ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default',
          isError ? 'text-error/80' : 'text-chat-text-muted',
        )}
      >
        {hasResult ? <Chevron open={expanded} /> : <span className="w-2 shrink-0" />}
        <span className="truncate">{label}</span>
      </button>
      {expanded && tc.result && (
        <pre className="mt-1 mx-1 px-2 py-1.5 text-2xs font-mono leading-relaxed bg-code-block rounded border border-code-block-border text-chat-text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
          {tc.result}
        </pre>
      )}
    </div>
  );
}

export default function ToolCallRows({ calls }: { calls: ToolCall[] }) {
  const failed = calls.some(isToolError);
  const [open, setOpen] = useState(failed);
  if (calls.length === 0) return null;
  if (calls.length === 1) return <ToolCallItem tc={calls[0]!} />;
  return (
    <div className="rounded-[var(--radius-sm)] border border-border/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="tool-group"
        data-error={failed ? 'true' : 'false'}
        className={cn(
          'text-xs font-mono px-2 py-1 flex items-center gap-1.5 w-full text-left cursor-pointer transition-colors hover:bg-surface-hover rounded-[var(--radius-sm)]',
          failed ? 'text-error/80' : 'text-chat-text-muted',
        )}
      >
        <Chevron open={open} />
        <span className="truncate">{summarizeToolCalls(calls)}</span>
      </button>
      {/* The rows stay in the document when folded — the record is there to
          find, read by a script or a screen reader, and the fold is only a view. */}
      <div className="px-1 pb-1 space-y-0.5" hidden={!open}>
        {calls.map((tc, i) => (
          <ToolCallItem key={tc.id || i} tc={tc} />
        ))}
      </div>
    </div>
  );
}
