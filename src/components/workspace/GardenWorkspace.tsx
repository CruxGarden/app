import { useLayoutEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useStore, type StoreApi } from 'zustand';
import { useGardenContext } from '@/stores/gardenContext';
import { createUIStore, gardenLayoutKey, type UIState } from '@/stores/uiStore';
import { gardenWorkspace } from '@/stores/workspaceSelection';
import { getSetting } from '@/services/settings';
import { GardenPaneBody, PaneMosaic } from './WorkspaceLayout';

const stores = new Map<string, StoreApi<UIState>>();
/** The last Garden workspace shown — it outlives the brief unmount while a location resolves. */
let last: StoreApi<UIState> | null = null;
/**
 * Each Garden keeps its own arrangement of panes. One never arranged opens the
 * way the Garden you came from was, so moving between Gardens keeps your panes.
 */
function gardenUI(id: string): StoreApi<UIState> {
  let ui = stores.get(id);
  if (ui) return ui;
  const arranged = !!getSetting(gardenLayoutKey(id));
  stores.set(id, (ui = createUIStore(id, 'garden')));
  const from = last?.getState().mosaicLayout;
  if (!arranged && from) ui.getState().setMosaicLayout(from);
  return ui;
}

/**
 * A Garden's workspace: its Home and the Garden-wide panes (Collaboration,
 * Mood, Settings, Explore, Navigator…), resizable and rearrangeable like a
 * Crux's.
 */
export default function GardenWorkspace() {
  const gardenId = useGardenContext((s) => s.garden?.id);
  const ui = gardenId ? gardenUI(gardenId) : null;
  useLayoutEffect(() => {
    if (ui) last = ui;
    gardenWorkspace.setState({ ui });
    return () => {
      if (gardenWorkspace.getState().ui === ui) gardenWorkspace.setState({ ui: null });
    };
  }, [ui]);
  const current = useStore(gardenWorkspace, (s) => s.ui);
  if (!ui || current !== ui) return null;
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-full min-h-0" data-garden-workspace={gardenId}>
        <PaneMosaic Body={GardenPaneBody} />
      </div>
    </DndProvider>
  );
}
