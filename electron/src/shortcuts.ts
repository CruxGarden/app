/**
 * The app's keyboard shortcuts, written down once (EF09). The renderer's key
 * handler (Shell), the Keyboard Shortcuts list and the application menu's
 * accelerators all read this table, so what the list says is what the keys do.
 * Pure data: no Electron, no DOM — the renderer imports it like bridge.ts.
 */
export type ShortcutGroup = 'Anywhere' | 'Workspaces' | 'Files and panels' | 'Window';

export interface ShortcutDef {
  id: string;
  label: string;
  group: ShortcutGroup;
  /** `KeyboardEvent.key`, lower case for letters. */
  key: string;
  /** ⌘ on a Mac, Ctrl elsewhere. */
  mod?: boolean;
  /** The Control key itself, on every platform. */
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Only where the desktop shell provides it. */
  desktop?: boolean;
  /** Only while the collaborator is switched on. */
  collaborator?: boolean;
  /** Differs on a Mac. */
  mac?: Pick<ShortcutDef, 'key' | 'mod' | 'ctrl' | 'alt' | 'shift'>;
}

export const SHORTCUTS = [
  { id: 'palette', label: 'Search or run a command', group: 'Anywhere', key: 'k', mod: true },
  { id: 'settings', label: 'Settings', group: 'Anywhere', key: ',', mod: true },
  { id: 'mood', label: 'Mood', group: 'Anywhere', key: 'm', mod: true },
  { id: 'new-crux', label: 'New Crux', group: 'Anywhere', key: 'n', mod: true, desktop: true },
  {
    id: 'console',
    label: 'Open the Console',
    group: 'Anywhere',
    key: 'Escape',
    collaborator: true,
  },
  {
    id: 'find-workspace',
    label: 'Find an open workspace',
    group: 'Workspaces',
    key: 'k',
    mod: true,
    alt: true,
  },
  { id: 'next-workspace', label: 'Next workspace', group: 'Workspaces', key: 'Tab', ctrl: true },
  {
    id: 'previous-workspace',
    label: 'Previous workspace',
    group: 'Workspaces',
    key: 'Tab',
    ctrl: true,
    shift: true,
  },
  { id: 'save', label: 'Save the open file', group: 'Files and panels', key: 's', mod: true },
  {
    id: 'address',
    label: 'Go to the address field (Web panel)',
    group: 'Files and panels',
    key: 'l',
    mod: true,
  },
  {
    id: 'close-window',
    label: 'Close the window',
    group: 'Window',
    key: 'w',
    mod: true,
    desktop: true,
  },
  { id: 'zoom-in', label: 'Zoom in', group: 'Window', key: '+', mod: true, desktop: true },
  { id: 'zoom-out', label: 'Zoom out', group: 'Window', key: '-', mod: true, desktop: true },
  { id: 'zoom-reset', label: 'Actual size', group: 'Window', key: '0', mod: true, desktop: true },
  {
    id: 'fullscreen',
    label: 'Full screen',
    group: 'Window',
    key: 'F11',
    desktop: true,
    mac: { key: 'f', mod: true, ctrl: true },
  },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  'Anywhere',
  'Workspaces',
  'Files and panels',
  'Window',
];

export function shortcut(id: ShortcutId): ShortcutDef {
  return SHORTCUTS.find((s) => s.id === id)!;
}

function chord(def: ShortcutDef, mac: boolean) {
  return mac && def.mac ? def.mac : def;
}

/** The keys as they are printed on this machine, e.g. ['⌘', 'K'] or ['Ctrl', 'K']. */
export function shortcutKeys(def: ShortcutDef, mac: boolean): string[] {
  const c = chord(def, mac);
  const keys: string[] = [];
  if (c.ctrl) keys.push(mac ? '⌃' : 'Ctrl');
  if (c.alt) keys.push(mac ? '⌥' : 'Alt');
  if (c.shift) keys.push(mac ? '⇧' : 'Shift');
  if (c.mod) keys.push(mac ? '⌘' : 'Ctrl');
  const names: Record<string, string> = { Escape: 'Esc', Tab: 'Tab', ',': ',' };
  keys.push(names[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
  // Ctrl+Ctrl never happens: `mod` and `ctrl` together only exist on a Mac.
  return keys.filter((key, index) => keys.indexOf(key) === index);
}

/** One short string, e.g. '⌘,' or 'Ctrl ,' — for a hint beside a command. */
export function shortcutText(def: ShortcutDef, mac: boolean): string {
  return shortcutKeys(def, mac).join(mac ? '' : ' ');
}

/** Electron accelerator for a menu item that owns this shortcut. */
export function shortcutAccelerator(def: ShortcutDef, mac: boolean): string {
  const c = chord(def, mac);
  const parts: string[] = [];
  if (c.mod) parts.push('CmdOrCtrl');
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  const names: Record<string, string> = { Escape: 'Esc', '+': 'Plus' };
  parts.push(names[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
  return parts.join('+');
}

/** Does this key event press the shortcut? Modifiers must match exactly. */
export function matchesShortcut(
  def: ShortcutDef,
  event: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  },
): boolean {
  if (event.key.toLowerCase() !== def.key.toLowerCase()) return false;
  const mod = !!event.metaKey || !!event.ctrlKey;
  if (def.mod ? !mod : def.ctrl ? !event.ctrlKey : mod) return false;
  return !!event.altKey === !!def.alt && !!event.shiftKey === !!def.shift;
}
