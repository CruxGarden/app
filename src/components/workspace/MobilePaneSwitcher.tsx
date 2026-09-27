import { cn } from '@/lib/cn';
import {
  useWorkspaceUIStore as useUIStore,
  PANE_COLORS,
  DEFAULT_PANE_ORDER,
  GARDEN_PANE_ORDER,
} from '@/stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { PANES } from './paneConfig';
import PaneIcon from './PaneIcon';
import { usePaneLabels } from '@/hooks/usePaneLabels';

export default function MobilePaneSwitcher() {
  const labels = usePaneLabels();
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
        const spec = PANES[pane];
        const label = labels[pane] === spec.label ? (spec.short ?? spec.label) : labels[pane];
        const isActive = mobileActivePane === pane;

        return (
          <button
            key={pane}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => setMobileActivePane(pane)}
            style={isActive ? { color: PANE_COLORS[pane] } : undefined}
            className={cn(
              'flex shrink-0 flex-col items-center gap-0.5 px-3 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              isActive
                ? 'bg-accent-muted'
                : 'text-text-muted hover:text-text hover:bg-action-button-hover',
            )}
          >
            <PaneIcon type={pane} size={16} />
            <span className="text-3xs font-mono">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
