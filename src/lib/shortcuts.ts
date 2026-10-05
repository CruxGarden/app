/**
 * The app's keyboard shortcuts. The table itself lives beside the desktop
 * shell (`electron/src/shortcuts.ts`, pure data) so the application menu's
 * accelerators, the Shell's key handler and the Keyboard Shortcuts list all
 * read one definition.
 */
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  shortcutKeys,
  type ShortcutDef,
  type ShortcutGroup,
} from '../../electron/src/shortcuts';

export {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  shortcut,
  shortcutKeys,
  shortcutText,
  matchesShortcut,
} from '../../electron/src/shortcuts';
export type { ShortcutDef, ShortcutGroup, ShortcutId } from '../../electron/src/shortcuts';

export interface ShortcutRow {
  id: string;
  label: string;
  keys: string[];
}

/** The list as this machine shows it: grouped, without what this platform or setup lacks. */
export function listShortcuts(options: {
  mac: boolean;
  /** The desktop shell is present (window and menu shortcuts apply). */
  desktop: boolean;
  /** The collaborator is switched on. */
  collaborator: boolean;
}): { group: ShortcutGroup; rows: ShortcutRow[] }[] {
  const shown = (SHORTCUTS as readonly ShortcutDef[]).filter(
    (s) => (!s.desktop || options.desktop) && (!s.collaborator || options.collaborator),
  );
  return SHORTCUT_GROUPS.map((group) => ({
    group,
    rows: shown
      .filter((s) => s.group === group)
      .map((s) => ({ id: s.id, label: s.label, keys: shortcutKeys(s, options.mac) })),
  })).filter((g) => g.rows.length > 0);
}

/**
 * A shortcut the application menu also carries can arrive twice for one press:
 * as the window's own keydown and as the menu's accelerator. Whichever comes
 * first claims the press; the other, arriving a moment later from the other
 * source, is dropped. Two presses from the same source are two presses.
 */
const claims = new Map<string, { source: 'key' | 'menu'; at: number }>();
export function claimShortcut(id: string, source: 'key' | 'menu', now = Date.now()): boolean {
  const last = claims.get(id);
  if (last && last.source !== source && now - last.at < 350) {
    claims.delete(id);
    return false;
  }
  claims.set(id, { source, at: now });
  return true;
}
