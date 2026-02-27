import { cn } from '@/lib/cn';
import { useUIStore, type PaneType } from '@/stores/uiStore';

const PANE_ICONS: Record<PaneType, { label: string; icon: React.ReactNode }> = {
  navigation: {
    label: 'Nav',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22V8" />
        <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
        <circle cx="12" cy="5" r="3" />
      </svg>
    ),
  },
  chat: {
    label: 'Chat',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  artifacts: {
    label: 'Files',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  editor: {
    label: 'Edit',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
};

export default function MobilePaneSwitcher() {
  const { mobileActivePane, setMobileActivePane } = useUIStore();

  return (
    <div className="flex items-center justify-around h-12 border-t border-border bg-surface/30 backdrop-blur-[var(--glass-blur)] shrink-0">
      {(Object.keys(PANE_ICONS) as PaneType[]).map((pane) => {
        const { label, icon } = PANE_ICONS[pane];
        const isActive = mobileActivePane === pane;

        return (
          <button
            key={pane}
            onClick={() => setMobileActivePane(pane)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              isActive
                ? 'text-accent'
                : 'text-text-muted',
            )}
          >
            {icon}
            <span className="text-[9px] font-mono">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
