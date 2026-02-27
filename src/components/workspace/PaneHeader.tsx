import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePaneDrag } from './DragContext';
import { useUIStore, type PaneType } from '@/stores/uiStore';

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
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
      className={cn(
        'flex items-center justify-between px-4 h-10 border-b border-border shrink-0',
        'cursor-grab active:cursor-grabbing select-none',
        'transition-colors duration-150',
        isDragging && 'opacity-40',
        isDropTarget && 'bg-accent-muted/20 border-b-accent/50',
      )}
    >
      {children ?? (
        <div className="flex items-center gap-2 text-text-muted">
          {icon}
          <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        {actions}
        <button
          onClick={() => setPaneVisible(paneType, false)}
          className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer rounded hover:bg-surface/50"
          title={`Hide ${label ?? paneType}`}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
