import { cn } from '@/lib/cn';
import {
  useWorkspaceUIStore as useUIStore,
  PANE_COLORS,
  DEFAULT_PANE_ORDER,
  GARDEN_PANE_ORDER,
  type PaneType,
} from '@/stores/uiStore';
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
  MoodIcon,
  SlidersIcon,
  GlobeIcon,
  UploadIcon,
  ActivityIcon,
  HomeIcon,
  SproutIcon,
  PlusCircleIcon,
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
  mood: { label: 'Mood', icon: <MoodIcon size={16} /> },
  synth: { label: 'Crux Synth', icon: <SlidersIcon size={16} /> },
  browser: { label: 'WWW', icon: <GlobeIcon size={16} /> },
  settings: { label: 'Settings', icon: <SlidersIcon size={16} /> },
  explore: { label: 'Explore', icon: <SearchIcon size={16} /> },
  media: {
    label: 'Find media',
    icon: <SearchIcon size={16} />,
  },
  home: { label: 'Home', icon: <HomeIcon size={16} /> },
  console: { label: 'Garden', icon: <SproutIcon size={16} /> },
  navigator: { label: 'Navigate', icon: <PlusCircleIcon size={16} /> },
  tending: { label: 'Tending', icon: <ActivityIcon size={16} /> },
};

export default function MobilePaneSwitcher() {
  const { mobileActivePane, setMobileActivePane, scope } = useUIStore(
    useShallow((s) => ({
      mobileActivePane: s.mobileActivePane,
      setMobileActivePane: s.setMobileActivePane,
      scope: s.workspaceScope,
    })),
  );

  return (
    <div className="flex items-center h-12 min-w-0 overflow-x-auto border-t border-border bg-surface-solid shrink-0">
      {(scope === 'garden' ? GARDEN_PANE_ORDER : DEFAULT_PANE_ORDER).map((pane) => {
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
