import type { StoreApi } from 'zustand';
import type { MenuCommand } from '../../../electron/src/bridge';
import { openFieldGuide } from '@/stores/fieldGuide';
import { gardenPath, useGardenContext } from '@/stores/gardenContext';
import { openShellDialog } from '@/stores/shellDialogs';
import { toast } from '@/stores/toastStore';
import { currentWorkspaceUI, useUIStore, type UIState } from '@/stores/uiStore';
import { requestUi } from '@/lib/ui-requests';
import { claimShortcut } from '@/lib/shortcuts';
import { updates } from '@/services/desktop';

/**
 * Commands with more than one way in — the command palette, a keyboard
 * shortcut, the desktop application menu — written once. The palette and the
 * Shell's menu listener both call these; neither re-implements them.
 */
export function openSettings() {
  useUIStore.getState().setSettingsOpen(true);
}

/** ⌘, */
export function toggleSettings() {
  currentWorkspaceUI().getState().togglePane('settings');
}

/** ⌘M */
export function toggleMood() {
  useUIStore.getState().toggleMoodPane();
}

/** "New Crux…": from a Crux, go to its Garden's Home first; the Home answers the request. */
export function newCrux(
  navigate: (to: string) => void,
  ui: StoreApi<UIState> = currentWorkspaceUI(),
) {
  const { workspaceScope, activeCruxId, setPaneVisible } = ui.getState();
  const garden = useGardenContext.getState().garden;
  if (workspaceScope === 'crux' && activeCruxId && garden) navigate(gardenPath(garden.id));
  else setPaneVisible('home', true);
  requestUi('new-crux');
}

/** "Check for Updates…" outside Settings: say what the check found. */
export async function checkForUpdates() {
  const before = await updates.state();
  if (!before || before.status === 'disabled') {
    toast('Updates apply to installed builds only.');
    return;
  }
  const state = await updates.check();
  if (!state) return;
  const settings = { label: 'Settings', run: openSettings };
  if (state.status === 'not-available') toast('You have the latest version.');
  else if (state.status === 'error')
    toast(`Update check failed: ${state.error ?? 'unknown error'}`, {
      tone: 'error',
      action: settings,
    });
  else if (state.status === 'available')
    toast(`Version ${state.availableVersion} is available.`, { action: settings });
  else if (state.status === 'downloaded')
    toast(`Version ${state.availableVersion} is ready to install.`, { action: settings });
}

/** What an application-menu item does in the window. */
export function runMenuCommand(
  command: MenuCommand,
  viaAccelerator: boolean,
  navigate: (to: string) => void,
) {
  switch (command) {
    case 'settings':
      // The keys toggle, as they do in the window; choosing the item opens.
      if (!viaAccelerator) openSettings();
      else if (claimShortcut('settings', 'menu')) toggleSettings();
      return;
    case 'mood':
      if (!viaAccelerator || claimShortcut('mood', 'menu')) toggleMood();
      return;
    case 'new-crux':
      newCrux(navigate);
      return;
    case 'field-guide':
      openFieldGuide();
      return;
    case 'shortcuts':
    case 'report-problem':
    case 'about':
      openShellDialog(command);
      return;
    case 'check-updates':
      void checkForUpdates();
      return;
  }
}
