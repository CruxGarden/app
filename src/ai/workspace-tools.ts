import type { ToolDefinition } from './tools';
import { DEFAULT_PANE_LABELS } from '@/lib/pane-labels';
import { pathOf } from '@/lib/artifact-path';
import type { PaneType } from '@/stores/uiStore';
import { getServices } from '@/services';

/**
 * The crux collaborator's operating tools (MAKING-IT-POSSIBLE step 10, the
 * parity rule): what the person does with the panes and the Workshop, and
 * what the Share pane's Functions section does — as tools in the crux the
 * collaborator sits in. `show` brings a pane or a file into view so the
 * person watches; `test_function` runs one of the crux's functions here,
 * against the local Store, the way Run and Emit do.
 */
const PANES = Object.keys(DEFAULT_PANE_LABELS) as PaneType[];

export const WORKSPACE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'show',
    description:
      'Bring a pane or a file of this crux into view so the person sees what you are working on: what "pane" opens or closes a pane; what "file" opens a path in the Workshop.',
    input_schema: {
      type: 'object',
      properties: {
        what: { type: 'string', enum: ['pane', 'file'] },
        pane: { type: 'string', enum: PANES },
        visible: { type: 'boolean', description: 'For a pane: open (default) or close.' },
        path: { type: 'string', description: 'For a file: its path in this crux.' },
      },
      required: ['what'],
      additionalProperties: false,
    },
  },
  {
    name: 'test_function',
    description:
      "Run one of this crux's functions here, against the local Store, and see what it answers: name (functions/<name>.js) with an optional body, or event (functions/on-<event>.js and every handler whose match fits) with optional data. Use it after writing or changing a handler.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        body: { description: 'JSON body for an HTTP handler.' },
        event: { type: 'string' },
        data: { description: 'The event data.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export const WORKSPACE_TOOL_NAMES = new Set(WORKSPACE_TOOL_DEFINITIONS.map((t) => t.name));

const str = (v: unknown, max = 400) =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;

export function validateWorkspaceTool(
  name: string,
  input: Record<string, unknown>,
): { valid: boolean; error?: string } {
  switch (name) {
    case 'show':
      if (input.what !== 'pane' && input.what !== 'file')
        return { valid: false, error: 'what must be "pane" or "file"' };
      if (input.what === 'pane' && !PANES.includes(input.pane as PaneType))
        return { valid: false, error: `pane must be one of ${PANES.join(', ')}` };
      if (input.what === 'file' && !str(input.path))
        return { valid: false, error: 'path is required for a file' };
      return { valid: true };
    case 'test_function': {
      const fn = str(input.name, 80);
      const ev = str(input.event, 120);
      if (!fn && !ev) return { valid: false, error: 'give a function name or an event' };
      if (fn && !/^[A-Za-z0-9._-]+$/.test(fn))
        return { valid: false, error: 'name: letters, digits, dots and dashes' };
      return { valid: true };
    }
    default:
      return { valid: false, error: `Unknown tool: ${name}` };
  }
}

export async function runWorkspaceTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { cruxId: string },
): Promise<string> {
  const result = await runInner(name, input, ctx);
  console.info('[workspace-tool]', name, result.slice(0, 200).replace(/\n/g, ' '));
  return result;
}

async function runInner(
  name: string,
  input: Record<string, unknown>,
  ctx: { cruxId: string },
): Promise<string> {
  switch (name) {
    case 'show': {
      const { getWorkspace } = await import('@/stores/workspaceRegistry');
      const w = getWorkspace(ctx.cruxId);
      if (!w) return 'Error: this crux is not open in the workspace.';
      if (input.what === 'pane') {
        const pane = input.pane as PaneType;
        const visible = input.visible !== false;
        w.ui.getState().setPaneVisible(pane, visible);
        return `${visible ? 'Opened' : 'Closed'} the ${DEFAULT_PANE_LABELS[pane]} pane.`;
      }
      const path = (input.path as string).replace(/^\//, '');
      const artifacts = await getServices().artifact.findByResource('crux', ctx.cruxId);
      const file = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === path);
      if (!file) return `Error: no file "${path}" in this crux.`;
      w.ui.getState().setPaneVisible('workshop', true);
      w.ui.getState().openFile(file.id, path);
      return `Showing ${path} in the Workshop.`;
    }
    case 'test_function': {
      const { callLocalFunction, emitLocal } = await import('@/services/functions-runner');
      const { useAppStore } = await import('@/stores/appStore');
      const visitorId = useAppStore.getState().author?.id ?? null;
      if (typeof input.name === 'string' && input.name.trim()) {
        const r = await callLocalFunction(
          ctx.cruxId,
          input.name.trim(),
          input.body ?? {},
          visitorId,
        );
        return [
          `functions/${input.name.trim()}.js answered ${r.status} in ${r.ms} ms:`,
          JSON.stringify(r.body, null, 1),
          r.logs.length ? `logs:\n${r.logs.map((l) => `- ${l}`).join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      const r = await emitLocal(
        ctx.cruxId,
        String(input.event).trim(),
        input.data ?? {},
        visitorId,
      );
      const lines = [
        `event "${r.event}" reached ${r.handlers} handler${r.handlers === 1 ? '' : 's'}.`,
      ];
      for (const [handler, res] of Object.entries(r.results))
        lines.push(`- functions/${handler}.js → ${res.status}: ${JSON.stringify(res.body)}`);
      if (r.refused) lines.push(`refused by ${r.refused.handler}: ${r.refused.message}`);
      return lines.join('\n');
    }
    default:
      return `Error: Unknown tool: ${name}`;
  }
}
