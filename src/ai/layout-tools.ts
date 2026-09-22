import type { ToolDefinition } from './tools';
import { workspaceSelection } from '@/stores/workspaceSelection';
import { getWorkspace } from '@/stores/workspaceRegistry';
import {
  listWorkspaceLayouts,
  saveWorkspaceLayout,
  applyWorkspaceLayout,
  arrangeWorkspacePanels,
  deleteWorkspaceLayout,
} from '@/services/workspace-layouts';

export const WORKSPACE_LAYOUT_TOOL: ToolDefinition = {
  name: 'workspace_layouts',
  description:
    'List, save, apply or delete named panel arrangements, or arrange the currently open panels, using the same controls as Settings → Workspace layouts. Applying keeps the current Crux, files, drafts and running collaborators. Read before changing. Arranging redistributes open panels without changing saved arrangements. Only change layouts when asked.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'save', 'apply', 'delete', 'arrange'] },
      name: {
        type: 'string',
        description: 'Arrangement name, 1–80 characters. Saving the same name replaces it.',
      },
      layout: {
        description:
          'For save, optional split tree: a panel id or {direction:row|column,first,second,splitPercentage:5..95}; null means no panels. Omit to save the current arrangement. Dragging/resizing panels in the UI edits this same tree.',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
};
export async function runWorkspaceLayouts(
  input: Record<string, unknown>,
  cruxId?: string,
): Promise<string> {
  const action = input.action;
  if (!['list', 'save', 'apply', 'delete', 'arrange'].includes(String(action)))
    throw new Error('Choose list, save, apply, delete or arrange.');
  const ui = cruxId ? getWorkspace(cruxId)?.ui : workspaceSelection.getState().active?.ui;
  if (action === 'arrange') {
    if (!ui?.getState().activeCruxId) throw new Error('Open a Crux before arranging panels.');
    await arrangeWorkspacePanels(ui);
  } else if (action !== 'list') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80)
      throw new Error('Give a workspace layout name (1–80 characters).');
    const name = input.name.trim();
    if (action === 'delete') deleteWorkspaceLayout(name);
    else {
      if (!ui?.getState().activeCruxId)
        throw new Error('Open a Crux before saving or applying a workspace layout.');
      if (action === 'save')
        saveWorkspaceLayout(
          name,
          input.layout === undefined ? ui.getState().mosaicLayout : input.layout,
        );
      else await applyWorkspaceLayout(ui, name);
    }
  }
  return JSON.stringify({
    layouts: listWorkspaceLayouts(),
    current: ui?.getState().mosaicLayout ?? null,
  });
}
