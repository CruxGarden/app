import type { PaneType } from '@/stores/uiStore';
import {
  ChatIcon,
  FolderIcon,
  CodeIcon,
  TagIcon,
  StackIcon,
  ExportIcon,
  SyncIcon,
  ShareIcon,
  StoreIcon,
} from '@/components/ui/icons';

/** CSS variable prefixes for each pane (used for pane-specific theming) */
export const PANE_VAR_PREFIX: Record<PaneType, string> = {
  collaboration: '--pane-collaboration',
  artifacts: '--pane-artifacts',
  workshop: '--pane-workshop',
  details: '--pane-details',
  history: '--pane-history',
  export: '--pane-export',
  sync: '--pane-sync',
  publish: '--pane-publish',
  store: '--pane-store',
};

/** Button config for pane toggle buttons in the TopBar */
export const PANE_BUTTONS: { type: PaneType; icon: React.FC; label: string }[] = [
  { type: 'collaboration', icon: ChatIcon, label: 'Collaboration' },
  { type: 'artifacts', icon: FolderIcon, label: 'Artifacts' },
  { type: 'workshop', icon: CodeIcon, label: 'Workshop' },
  { type: 'details', icon: TagIcon, label: 'Metadata' },
  { type: 'history', icon: StackIcon, label: 'History' },
  { type: 'export', icon: ExportIcon, label: 'Export' },
  { type: 'sync', icon: SyncIcon, label: 'Sync' },
  { type: 'publish', icon: ShareIcon, label: 'Share' },
  { type: 'store', icon: StoreIcon, label: 'Store' },
];
