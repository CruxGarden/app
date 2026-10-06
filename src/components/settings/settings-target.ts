/**
 * Where Settings should open. Copy that names a place ("See Usage in
 * Settings", "Settings → Plan") passes that place to `openSettings`, and the
 * Settings pane scrolls there — at once when it is already open, or when it
 * mounts. Pure and DOM-free so the routing is testable in the node suite.
 */

/** The groups the Settings pane lists in its section navigation. */
export type SettingsGroup = 'start' | 'library' | 'account' | 'ai' | 'garden' | 'appearance';

/** A group, or one card inside a group that copy names directly. */
export type SettingsSection =
  | SettingsGroup
  | 'plan'
  | 'usage'
  | 'agents'
  | 'memory'
  | 'desktop'
  | 'disk'
  | 'names'
  | 'layouts';

export interface SettingsPlace {
  /** The group to select in the section navigation. */
  group: SettingsGroup;
  /** A selector for the card inside the group, when the place is a card. */
  card?: string;
}

const PLACES: Record<SettingsSection, SettingsPlace> = {
  start: { group: 'start' },
  library: { group: 'library' },
  account: { group: 'account' },
  plan: { group: 'account', card: '[data-testid="plan-settings"]' },
  usage: { group: 'account', card: '[data-testid="usage-settings"]' },
  ai: { group: 'ai' },
  memory: { group: 'ai', card: '[data-testid="memory-settings"]' },
  agents: { group: 'ai', card: '[data-testid="agents-settings"]' },
  garden: { group: 'garden' },
  desktop: { group: 'garden', card: '[data-testid="desktop-settings"]' },
  disk: { group: 'garden', card: '[data-testid="disk-usage"]' },
  appearance: { group: 'appearance' },
  names: { group: 'appearance', card: '[data-testid="names-settings"]' },
  layouts: { group: 'appearance', card: 'section[aria-label="Workspace layouts"]' },
};

/** The group and card a section names. Unknown names fall back to the first group. */
export function settingsPlace(section: SettingsSection): SettingsPlace {
  return PLACES[section] ?? { group: 'start' };
}

let pending: SettingsSection | null = null;
const listeners = new Set<(section: SettingsSection) => void>();

/** Ask Settings to show a section; it waits until a Settings pane takes it. */
export function requestSettingsSection(section: SettingsSection) {
  pending = section;
  for (const listener of [...listeners]) listener(section);
}

/** The waiting request, once: whoever shows it takes it. */
export function takeSettingsSection(): SettingsSection | null {
  const section = pending;
  pending = null;
  return section;
}

/** Hear requests made while Settings is already open. Returns the unsubscribe. */
export function onSettingsSection(fn: (section: SettingsSection) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
