import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePaneDrag } from './DragContext';
import { useUIStore, PANE_COLORS, type PaneType } from '@/stores/uiStore';

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface PaneHeaderProps {
  paneType: PaneType;
  icon?: ReactNode;
  label?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function PaneHeader({ paneType, icon, label, actions, children }: PaneHeaderProps) {
  const { dragSource, dropTarget, startDrag, endDrag } = usePaneDrag();
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);

  const isDragging = dragSource === paneType;
  const isDropTarget = dropTarget === paneType && dragSource !== paneType;
  const paneColor = PANE_COLORS[paneType];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', paneType); // required for Firefox
        e.dataTransfer.effectAllowed = 'move';
        startDrag(paneType);
      }}
      onDragEnd={() => {
        endDrag();
      }}
      style={{
        borderTopColor: paneColor,
        '--pane-color': paneColor,
      } as React.CSSProperties}
      className={cn(
        'flex items-center justify-between px-4 h-10 border-t-2 border-b border-border shrink-0',
        'cursor-grab active:cursor-grabbing select-none',
        'transition-colors duration-150',
        'group-hover/pane:bg-[color-mix(in_srgb,var(--pane-color)_8%,transparent)]',
        isDragging && 'opacity-40',
        isDropTarget && 'bg-accent-muted/20 border-b-accent/50',
      )}
    >
      {children ?? (
        <div className="flex items-center gap-2" style={{ color: paneColor }}>
          {icon}
          <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
        </div>
      )}
      <div className={cn(
        'flex items-center gap-1 transition-opacity duration-150',
        'md:opacity-0 md:group-hover/pane:opacity-100',
      )}>
        {actions}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPaneVisible(paneType, false);
          }}
          className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
          title={`Close ${label || paneType}`}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
