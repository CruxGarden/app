import { DEFAULT_PANE_ORDER, GARDEN_PANE_ORDER, type PaneType } from '@/stores/uiStore';
import { paneOffered } from '@/components/workspace/paneConfig';

/** Panes that follow you across a Garden's workspaces, listed after a Crux's own. */
export const GARDEN_WIDE = new Set<PaneType>([
  'navigator',
  'console',
  'tending',
  'mood',
  'synth',
  'browser',
  'settings',
  'explore',
]);

/**
 * The panels a workspace offers, in the order the picker and the command
 * palette list them: a Crux's own first, then the Garden-wide ones. AI panes
 * only while AI tools are on.
 */
export function offeredPanes(
  scope: 'garden' | 'crux',
  activeCruxId: string | null,
  aiEnabled: boolean,
  advancedMode = true,
): PaneType[] {
  const order =
    scope === 'garden'
      ? GARDEN_PANE_ORDER
      : activeCruxId
        ? [
            ...DEFAULT_PANE_ORDER.filter((p) => !GARDEN_WIDE.has(p)),
            ...DEFAULT_PANE_ORDER.filter((p) => GARDEN_WIDE.has(p)),
          ]
        : [];
  return order.filter((pane) => paneOffered(pane, aiEnabled, advancedMode));
}
