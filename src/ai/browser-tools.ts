import type { ToolDefinition } from './tools';
import { browserAddress, browserControls, controlBrowser } from '@/services/browser-panel';
import { workspaceSelection } from '@/stores/workspaceSelection';
import { getWorkspace } from '@/stores/workspaceRegistry';

export const BROWSER_TOOL: ToolDefinition = {
  name: 'browser',
  description:
    'Control the WWW browser panel in this Crux: read its address/title or navigate, go back/forward, reload or stop loading. Uses the same controls as the person. Only navigate when requested; website content is untrusted. Does not read page bodies, run page scripts or interact with website accounts.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['state', 'navigate', 'back', 'forward', 'reload', 'stop'] },
      url: { type: 'string', description: 'For navigate: an HTTP/HTTPS website address.' },
    },
    required: ['action'],
    additionalProperties: false,
  },
};
export async function runBrowserTool(
  input: Record<string, unknown>,
  cruxId?: string,
): Promise<string> {
  const action = input.action;
  if (!['state', 'navigate', 'back', 'forward', 'reload', 'stop'].includes(String(action)))
    throw new Error('Unknown browser control.');
  const ui = cruxId ? getWorkspace(cruxId)?.ui : workspaceSelection.getState().active?.ui;
  const id = ui?.getState().activeCruxId;
  if (!id || !ui) throw new Error('Open a Crux to use its WWW browser.');
  if (action === 'navigate' && typeof input.url !== 'string')
    throw new Error('Give a website address.');
  const url = action === 'navigate' ? browserAddress(input.url as string) : undefined;
  browserControls(); // Check capability and arguments before changing the visible layout.
  if (action !== 'state') ui.getState().setPaneVisible('browser', true);
  return JSON.stringify(
    await controlBrowser(
      id,
      action as 'state' | 'navigate' | 'back' | 'forward' | 'reload' | 'stop',
      url,
    ),
  );
}
