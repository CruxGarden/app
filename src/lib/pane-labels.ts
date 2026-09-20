import type { PaneType } from '@/stores/uiStore';

/**
 * The names of things, as the garden chooses them (Daniel, 2026-09-20: "you
 * should be able to change the names of the builder panes, anywhere they are
 * referenced — this lets you craft the metaphor"; "and change the title
 * itself: The Bachelor Pad, Floyd County Police Department").
 *
 * They are Mood tokens (`paneLabel<Pane>`, `gardenTitle`) so a Mood or a
 * garden sets them like any other, and this module is the one place that
 * reads them: pane headers, toggles, empty states and the top bar ask here.
 * Test selectors keep the default words (`Toggle collaboration`), because a
 * metaphor is for the person, not the journeys.
 */
export const DEFAULT_PANE_LABELS: Record<PaneType, string> = {
  tasks: 'Tasks',
  history: 'History',
  collaboration: 'Collaboration',
  artifacts: 'Artifacts',
  workshop: 'Workshop',
  details: 'Metadata',
  export: 'Export',
  sync: 'Sync',
  publish: 'Share',
  store: 'Store',
  media: 'Find media',
};

/** The CSS variable each pane's name is read from (literal, so coverage can see it). */
const PANE_LABEL_VARS: Record<PaneType, string> = {
  tasks: '--pane-label-tasks',
  history: '--pane-label-history',
  collaboration: '--pane-label-collaboration',
  artifacts: '--pane-label-artifacts',
  workshop: '--pane-label-workshop',
  details: '--pane-label-details',
  export: '--pane-label-export',
  sync: '--pane-label-sync',
  publish: '--pane-label-publish',
  store: '--pane-label-store',
  media: '--pane-label-media',
};

function readVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A token value as a person typed it: quotes stripped, `none`/empty → nothing. */
export function asName(raw: string | null | undefined): string {
  const v = (raw ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
  return v && v !== 'none' ? v : '';
}

/** The pane's name from a token value, or its default. */
export function paneLabelFrom(type: PaneType, raw: string | null | undefined): string {
  return asName(raw) || DEFAULT_PANE_LABELS[type];
}

/** The pane's name in this garden, or its default. */
export function paneLabel(type: PaneType): string {
  return paneLabelFrom(type, readVar(PANE_LABEL_VARS[type]));
}

/** The garden's own title, if it has one ("" → show the username). */
export function gardenTitle(): string {
  return asName(readVar('--garden-title'));
}

/** The names this garden chose (title, and only the panes that differ from the usual word). */
export interface GardenNames {
  title: string;
  panes: Partial<Record<PaneType, string>>;
}
export function customNames(): GardenNames | undefined {
  const title = gardenTitle();
  const panes: Partial<Record<PaneType, string>> = {};
  for (const type of Object.keys(DEFAULT_PANE_LABELS) as PaneType[]) {
    const name = paneLabel(type);
    if (name !== DEFAULT_PANE_LABELS[type]) panes[type] = name;
  }
  return title || Object.keys(panes).length ? { title, panes } : undefined;
}

/** Every pane's name, for places that need the whole map at once. */
export function paneLabels(): Record<PaneType, string> {
  const out = { ...DEFAULT_PANE_LABELS };
  for (const type of Object.keys(out) as PaneType[]) out[type] = paneLabel(type);
  return out;
}
