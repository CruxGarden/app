import { cn } from '@/lib/cn';
import { useWorkspaceUIStore as useUIStore, PANE_COLORS, type PaneType } from '@/stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import {
  ChatIcon,
  CodeIcon,
  ExportIcon,
  FolderIcon,
  InfoIcon,
  RefreshIcon,
  StackIcon,
  StoreIcon,
  SearchIcon,
  UploadIcon,
  ActivityIcon,
} from '@/components/ui/icons';

const PANE_ICONS: Record<PaneType, { label: string; icon: React.ReactNode }> = {
  tasks: {
    label: 'Tasks',
    icon: <ActivityIcon size={16} />,
  },
  history: {
    label: 'History',
    icon: <StackIcon size={16} />,
  },
  collaboration: {
    label: 'Collab',
    icon: <ChatIcon size={16} />,
  },
  artifacts: {
    label: 'Files',
    icon: <FolderIcon size={16} />,
  },
  workshop: {
    label: 'Workshop',
    icon: <CodeIcon size={16} />,
  },
  details: {
    label: 'Details',
    icon: <InfoIcon size={16} />,
  },
  sync: {
    label: 'Sync',
    icon: <RefreshIcon size={16} />,
  },
  publish: {
    label: 'Share',
    icon: <UploadIcon size={16} />,
  },
  export: {
    label: 'Export',
    icon: <ExportIcon size={16} />,
  },
  store: {
    label: 'Store',
    icon: <StoreIcon size={16} />,
  },
  media: {
    label: 'Find media',
    icon: <SearchIcon size={16} />,
  },
};

export default function MobilePaneSwitcher() {
  const { mobileActivePane, setMobileActivePane } = useUIStore(
    useShallow((s) => ({
      mobileActivePane: s.mobileActivePane,
      setMobileActivePane: s.setMobileActivePane,
    })),
  );

  return (
    <div className="flex items-center h-12 min-w-0 overflow-x-auto border-t border-border bg-surface-solid shrink-0">
      {(Object.keys(PANE_ICONS) as PaneType[]).map((pane) => {
        const { label, icon } = PANE_ICONS[pane];
        const isActive = mobileActivePane === pane;

        return (
          <button
            key={pane}
            onClick={() => setMobileActivePane(pane)}
            style={isActive ? { color: PANE_COLORS[pane] } : undefined}
            className={cn(
              'flex shrink-0 flex-col items-center gap-0.5 px-3 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              !isActive && 'text-text-muted',
            )}
          >
            {icon}
            <span className="text-3xs font-mono">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
