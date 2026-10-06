import type { StoreApi } from 'zustand';
import { useGardenContext } from '@/stores/gardenContext';
import { currentWorkspaceUI, type UIState } from '@/stores/uiStore';
import { gardenWorkspace, workspaceSelection } from '@/stores/workspaceSelection';

/**
 * The Navigator is one choice — open or closed — shown as a pane in whichever
 * workspace is on screen, so it follows you as you navigate with it. Closing
 * its pane closes it everywhere.
 */
export function startNavigatorPane(): () => void {
  let watched: StoreApi<UIState> | null = null;
  let unwatch = () => {};
  const apply = () => {
    const ui = currentWorkspaceUI();
    const wanted = useGardenContext.getState().navigatorOpen;
    if (ui.getState().paneVisibility.navigator !== wanted)
      ui.getState().setPaneVisible('navigator', wanted);
    // In the one-pane narrow layout, navigating with the Navigator keeps it on screen.
    if (wanted && watched && watched !== ui && watched.getState().mobileActivePane === 'navigator')
      ui.getState().setMobileActivePane('navigator');
    if (watched === ui) return;
    unwatch();
    watched = ui;
    unwatch = ui.subscribe((state, previous) => {
      // Only the workspace on screen speaks for the Navigator; one closing in the background does not.
      if (ui !== currentWorkspaceUI()) return;
      const open = state.paneVisibility.navigator;
      if (
        open !== previous.paneVisibility.navigator &&
        open !== useGardenContext.getState().navigatorOpen
      )
        useGardenContext.getState().setNavigatorOpen(open);
    });
  };
  const offs = [
    useGardenContext.subscribe((state, previous) => {
      if (state.navigatorOpen !== previous.navigatorOpen) apply();
    }),
    workspaceSelection.subscribe(apply),
    gardenWorkspace.subscribe(apply),
  ];
  apply();
  return () => {
    offs.forEach((off) => off());
    unwatch();
  };
}
