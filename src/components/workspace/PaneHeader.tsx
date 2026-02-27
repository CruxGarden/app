import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePaneDrag } from './DragContext';
import { PANE_COLORS, type PaneType } from '@/stores/uiStore';

interface PaneHeaderProps {
  paneType: PaneType;
  icon?: ReactNode;
  label?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function PaneHeader({ paneType, icon, label, actions, children }: PaneHeaderProps) {
  const { dragSource, dropTarget, startDrag, endDrag } = usePaneDrag();

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
      style={{ borderTopColor: paneColor }}
      className={cn(
        'flex items-center justify-between px-4 h-10 border-t-2 border-b border-border shrink-0',
        'cursor-grab active:cursor-grabbing select-none',
        'transition-colors duration-150',
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
      {actions && (
        <div className="flex items-center gap-1">
          {actions}
        </div>
      )}
    </div>
  );
}
