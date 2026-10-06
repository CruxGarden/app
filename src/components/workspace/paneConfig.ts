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

export interface PaneLayout {
  /** Normal layouts disclose secondary controls; advanced layouts keep them within reach. */
  options: 'collapsed' | 'expanded';
  guidance: string;
}
export interface PaneSpec {
  layouts: { normal: PaneLayout; advanced: PaneLayout };
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
  /** An AI surface: offered only while AI tools are on (Settings → AI). */
  ai?: boolean;
  /** Technical controls hidden from discovery while Advanced Mode is off. */
  advanced?: boolean;
  /** Other words people look for it by (the picker and ⌘K find it by them too). */
  keywords?: string;
}

export const PANES: Record<PaneType, PaneSpec> = {
  navigator: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Find your Gardens and projects here. Choose one to open it.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Find your Gardens and projects here. Choose one to open it.',
      },
    },
    label: 'Navigator',
    short: 'Navigate',
    icon: PlusCircleIcon,
    color: 'var(--pane-artifacts)',
    prefix: '--pane-artifacts',
    labelVar: '--pane-label-navigator',
    minWidth: 170,
    keywords: 'tree gardens browse',
  },
  home: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Open a project to continue, or choose Add Crux to make something new.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Open a project to continue, or choose Add Crux to make something new.',
      },
    },
    label: 'Garden Home',
    icon: HomeIcon,
    color: 'var(--pane-workshop)',
    prefix: '--pane-workshop',
    labelVar: '--pane-label-home',
    minWidth: 360,
  },
  tasks: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Try changes in a Task, then review them before bringing them into your main project.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Try changes in a Task, then review them before bringing them into your main project.',
      },
    },
    label: 'Tasks',
    icon: ActivityIcon,
    color: 'var(--pane-tasks)',
    prefix: '--pane-tasks',
    labelVar: '--pane-label-tasks',
    minWidth: 110,
  },
  collaboration: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Describe what you want to make or ask for help. Review changes before sharing your work.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Describe what you want to make or ask for help. Review changes before sharing your work.',
      },
    },
    label: 'Collaboration',
    short: 'Collab',
    icon: ChatIcon,
    color: 'var(--pane-collaboration)',
    prefix: '--pane-collaboration',
    labelVar: '--pane-label-collaboration',
    minWidth: 260,
    ai: true,
    keywords: 'chat conversation ai',
  },
  console: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Ask for help organizing your Garden or finding your projects.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Ask for help organizing your Garden or finding your projects.',
      },
    },
    label: 'Garden Collaboration',
    short: 'Garden',
    icon: SproutIcon,
    color: 'var(--pane-collaboration)',
    prefix: '--pane-collaboration',
    labelVar: '--pane-label-console',
    minWidth: 260,
    ai: true,
    keywords: 'keeper chat garden ai',
  },
  artifacts: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'These are your project’s files. Open one to view or edit it. Your work stays on this computer until you share it.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'These are your project’s files. Open one to view or edit it. Your work stays on this computer until you share it.',
      },
    },
    label: 'Artifacts',
    short: 'Files',
    icon: FolderIcon,
    color: 'var(--pane-artifacts)',
    prefix: '--pane-artifacts',
    labelVar: '--pane-label-artifacts',
    minWidth: 160,
    keywords: 'files folder tree',
  },
  workshop: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Make and try your creation here. Use the walkthrough for help with your next step.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Make and try your creation here. Use the walkthrough for help with your next step.',
      },
    },
    label: 'Workshop',
    icon: CodeIcon,
    color: 'var(--pane-workshop)',
    prefix: '--pane-workshop',
    labelVar: '--pane-label-workshop',
    minWidth: 280,
    keywords: 'editor preview code',
  },
  details: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Give your project a name and description. Extra settings are optional.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Give your project a name and description. Extra settings are optional.',
      },
    },
    label: 'Details',
    icon: TagIcon,
    color: 'var(--pane-details)',
    prefix: '--pane-details',
    labelVar: '--pane-label-details',
    minWidth: 220,
    keywords: 'metadata settings info title description tags entry',
  },
  history: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Your work saves automatically. Mark a version to keep a named point you can return to.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Your work saves automatically. Mark a version to keep a named point you can return to.',
      },
    },
    label: 'Growth',
    icon: StackIcon,
    color: 'var(--pane-history)',
    prefix: '--pane-history',
    labelVar: '--pane-label-history',
    minWidth: 200,
    keywords: 'history versions snapshots checkpoints edits undo',
  },
  export: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Save a copy to keep or give to someone. Exporting does not put anything online.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Save a copy to keep or give to someone. Exporting does not put anything online.',
      },
    },
    label: 'Export',
    icon: ExportIcon,
    color: 'var(--pane-export)',
    prefix: '--pane-export',
    labelVar: '--pane-label-export',
    minWidth: 200,
    keywords: 'download archive backup zip',
  },
  sync: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Back up your project and history to your account. Backing up does not publish it.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Back up your project and history to your account. Backing up does not publish it.',
      },
    },
    label: 'Sync',
    icon: SyncIcon,
    color: 'var(--pane-sync)',
    prefix: '--pane-sync',
    labelVar: '--pane-label-sync',
    minWidth: 200,
    keywords: 'cloud push pull backup',
  },
  publish: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Review what visitors will see, publish it, then copy your link. Your editable project stays here.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Review what visitors will see, publish it, then copy your link. Your editable project stays here.',
      },
    },
    label: 'Share',
    icon: ShareIcon,
    color: 'var(--pane-publish)',
    prefix: '--pane-publish',
    labelVar: '--pane-label-publish',
    minWidth: 270,
    keywords: 'publish live website link',
  },
  store: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Advanced Mode provides access to the data used by your app.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Advanced Mode provides access to the data used by your app.',
      },
    },
    advanced: true,
    label: 'Store',
    icon: StoreIcon,
    color: 'var(--pane-store)',
    prefix: '--pane-store',
    labelVar: '--pane-label-store',
    minWidth: 280,
  },
  media: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Search for a picture or sound, then add it to your project. Check the usage rights shown with each result.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Search for a picture or sound, then add it to your project. Check the usage rights shown with each result.',
      },
    },
    label: 'Find media',
    icon: SearchIcon,
    color: 'var(--pane-media)',
    prefix: '--pane-media',
    labelVar: '--pane-label-media',
    minWidth: 300,
    keywords: 'images sounds stock photos',
  },
  mood: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Choose the look and feel of your workspace. You can change it whenever you like.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Choose the look and feel of your workspace. You can change it whenever you like.',
      },
    },
    label: 'Mood',
    icon: MoodIcon,
    color: 'var(--pane-mood)',
    prefix: '--pane-mood',
    labelVar: '--pane-label-mood',
    minWidth: 360,
  },
  synth: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Choose a sound and press Play. Sound and volume are always under your control.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Choose a sound and press Play. Sound and volume are always under your control.',
      },
    },
    label: 'Crux Synth',
    icon: SlidersIcon,
    color: 'var(--pane-synth)',
    prefix: '--pane-synth',
    labelVar: '--pane-label-synth',
    minWidth: 300,
  },
  browser: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Visit a website inside your workspace. The address here is separate from your own published page.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Visit a website inside your workspace. The address here is separate from your own published page.',
      },
    },
    label: 'WWW',
    icon: GlobeIcon,
    color: 'var(--pane-browser)',
    prefix: '--pane-browser',
    labelVar: '--pane-label-browser',
    minWidth: 200,
  },
  settings: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Adjust your preferences here. Getting started lets you change Advanced Mode or run setup again.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Adjust your preferences here. Getting started lets you change Advanced Mode or run setup again.',
      },
    },
    label: 'Settings',
    icon: SlidersIcon,
    color: 'var(--pane-settings)',
    prefix: '--pane-settings',
    labelVar: '--pane-label-settings',
    minWidth: 360,
  },
  explore: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance:
          'Discover published creations. Open one in your Garden when you want your own editable copy.',
      },
      advanced: {
        options: 'expanded',
        guidance:
          'Discover published creations. Open one in your Garden when you want your own editable copy.',
      },
    },
    label: 'Explore',
    icon: SearchIcon,
    color: 'var(--pane-explore)',
    prefix: '--pane-explore',
    labelVar: '--pane-label-explore',
    minWidth: 360,
    keywords: 'search community published discover',
  },
  tending: {
    layouts: {
      normal: {
        options: 'collapsed',
        guidance: 'Review scheduled work and requests that need your attention.',
      },
      advanced: {
        options: 'expanded',
        guidance: 'Review scheduled work and requests that need your attention.',
      },
    },
    label: 'Tending',
    icon: BellIcon,
    color: 'var(--pane-tasks)',
    prefix: '--pane-tasks',
    labelVar: '--pane-label-tending',
    minWidth: 320,
    keywords: 'schedules timers alerts tasks',
  },
};

export const PANE_TYPES = Object.keys(PANES) as PaneType[];

/** The panes that are AI (the Crux's and the Garden's Collaboration): gone while AI tools are off. */
export const AI_PANES: ReadonlySet<PaneType> = new Set(PANE_TYPES.filter((p) => PANES[p].ai));
/** Whether a pane can be offered at all right now. */
export const paneOffered = (pane: PaneType, aiEnabled: boolean, advancedMode = true) =>
  (aiEnabled || !AI_PANES.has(pane)) && (advancedMode || !PANES[pane].advanced);

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
