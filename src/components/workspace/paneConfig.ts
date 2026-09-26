import type { FC } from 'react';
import type { IconProps } from '@/components/ui/icons/Icon';
import {
  ActivityIcon,
  BellIcon,
  ChatIcon,
  FolderIcon,
  CodeIcon,
  TagIcon,
  StackIcon,
  ExportIcon,
  SyncIcon,
  ShareIcon,
  StoreIcon,
  SearchIcon,
  MoodIcon,
  SlidersIcon,
  GlobeIcon,
  HomeIcon,
  SproutIcon,
  PlusCircleIcon,
} from '@/components/ui/icons';

/**
 * The one registry of workspace panes. Everything a pane needs to be listed,
 * drawn and themed lives on its row: its default name (a Mood may rename it,
 * see lib/pane-labels), the glyph, the token family it paints with, and the
 * least width it makes sense in. Which panes a workspace offers, and which
 * open by default, is workspace policy and stays in the UI store.
 *
 * Token names are written out in full so the Mood token coverage test can see
 * every `--pane-*` family is consumed.
 */
export type PaneType =
  | 'tasks'
  | 'history'
  | 'collaboration'
  | 'artifacts'
  | 'workshop'
  | 'details'
  | 'sync'
  | 'publish'
  | 'export'
  | 'store'
  | 'media'
  | 'mood'
  | 'synth'
  | 'browser'
  | 'settings'
  | 'explore'
  | 'home'
  | 'console'
  | 'navigator'
  | 'tending';

export interface PaneSpec {
  /** The usual word for it; Names in Settings and a Mood can change it. */
  label: string;
  /** A shorter word for the phone-width switcher, when the label is long. */
  short?: string;
  icon: FC<IconProps>;
  /** The pane's accent, `var(--pane-x)`. */
  color: string;
  /** The token family the pane's header, body and buttons read: `--pane-x`. */
  prefix: string;
  /** The Mood token the pane's name is read from. */
  labelVar: string;
  /** Below this many pixels the pane asks to be widened instead of squeezing. */
  minWidth: number;
}

export const PANES: Record<PaneType, PaneSpec> = {
  navigator: {
    label: 'Navigator',
    short: 'Navigate',
    icon: PlusCircleIcon,
    color: 'var(--pane-artifacts)',
    prefix: '--pane-artifacts',
    labelVar: '--pane-label-navigator',
    minWidth: 170,
  },
  home: {
    label: 'Home',
    icon: HomeIcon,
    color: 'var(--pane-workshop)',
    prefix: '--pane-workshop',
    labelVar: '--pane-label-home',
    minWidth: 360,
  },
  tasks: {
    label: 'Tasks',
    icon: ActivityIcon,
    color: 'var(--pane-tasks)',
    prefix: '--pane-tasks',
    labelVar: '--pane-label-tasks',
    minWidth: 110,
  },
  collaboration: {
    label: 'Collaboration',
    short: 'Collab',
    icon: ChatIcon,
    color: 'var(--pane-collaboration)',
    prefix: '--pane-collaboration',
    labelVar: '--pane-label-collaboration',
    minWidth: 260,
  },
  console: {
    label: 'Garden Collaboration',
    short: 'Garden',
    icon: SproutIcon,
    color: 'var(--pane-collaboration)',
    prefix: '--pane-collaboration',
    labelVar: '--pane-label-console',
    minWidth: 260,
  },
  artifacts: {
    label: 'Artifacts',
    short: 'Files',
    icon: FolderIcon,
    color: 'var(--pane-artifacts)',
    prefix: '--pane-artifacts',
    labelVar: '--pane-label-artifacts',
    minWidth: 160,
  },
  workshop: {
    label: 'Workshop',
    icon: CodeIcon,
    color: 'var(--pane-workshop)',
    prefix: '--pane-workshop',
    labelVar: '--pane-label-workshop',
    minWidth: 280,
  },
  details: {
    label: 'Metadata',
    short: 'Details',
    icon: TagIcon,
    color: 'var(--pane-details)',
    prefix: '--pane-details',
    labelVar: '--pane-label-details',
    minWidth: 220,
  },
  history: {
    label: 'History',
    icon: StackIcon,
    color: 'var(--pane-history)',
    prefix: '--pane-history',
    labelVar: '--pane-label-history',
    minWidth: 200,
  },
  export: {
    label: 'Export',
    icon: ExportIcon,
    color: 'var(--pane-export)',
    prefix: '--pane-export',
    labelVar: '--pane-label-export',
    minWidth: 200,
  },
  sync: {
    label: 'Sync',
    icon: SyncIcon,
    color: 'var(--pane-sync)',
    prefix: '--pane-sync',
    labelVar: '--pane-label-sync',
    minWidth: 200,
  },
  publish: {
    label: 'Share',
    icon: ShareIcon,
    color: 'var(--pane-publish)',
    prefix: '--pane-publish',
    labelVar: '--pane-label-publish',
    minWidth: 270,
  },
  store: {
    label: 'Store',
    icon: StoreIcon,
    color: 'var(--pane-store)',
    prefix: '--pane-store',
    labelVar: '--pane-label-store',
    minWidth: 280,
  },
  media: {
    label: 'Find media',
    icon: SearchIcon,
    color: 'var(--pane-media)',
    prefix: '--pane-media',
    labelVar: '--pane-label-media',
    minWidth: 300,
  },
  mood: {
    label: 'Mood',
    icon: MoodIcon,
    color: 'var(--pane-mood)',
    prefix: '--pane-mood',
    labelVar: '--pane-label-mood',
    minWidth: 360,
  },
  synth: {
    label: 'Crux Synth',
    icon: SlidersIcon,
    color: 'var(--pane-synth)',
    prefix: '--pane-synth',
    labelVar: '--pane-label-synth',
    minWidth: 300,
  },
  browser: {
    label: 'WWW',
    icon: GlobeIcon,
    color: 'var(--pane-browser)',
    prefix: '--pane-browser',
    labelVar: '--pane-label-browser',
    minWidth: 200,
  },
  settings: {
    label: 'Settings',
    icon: SlidersIcon,
    color: 'var(--pane-settings)',
    prefix: '--pane-settings',
    labelVar: '--pane-label-settings',
    minWidth: 360,
  },
  explore: {
    label: 'Explore',
    icon: SearchIcon,
    color: 'var(--pane-explore)',
    prefix: '--pane-explore',
    labelVar: '--pane-label-explore',
    minWidth: 360,
  },
  tending: {
    label: 'Tending',
    icon: BellIcon,
    color: 'var(--pane-tasks)',
    prefix: '--pane-tasks',
    labelVar: '--pane-label-tending',
    minWidth: 320,
  },
};

export const PANE_TYPES = Object.keys(PANES) as PaneType[];

function column<K extends keyof PaneSpec>(key: K): Record<PaneType, PaneSpec[K]> {
  const out = {} as Record<PaneType, PaneSpec[K]>;
  for (const type of PANE_TYPES) out[type] = PANES[type][key];
  return out;
}

/** `--pane-x`, the token family each pane paints with. */
export const PANE_VAR_PREFIX = column('prefix');
/** `var(--pane-x)`, each pane's accent. */
export const PANE_COLORS = column('color');
/** The least width each pane makes sense in. */
export const PANE_MIN_WIDTH = column('minWidth');
/** The usual word for each pane. */
export const DEFAULT_PANE_LABELS = column('label');
