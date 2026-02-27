import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { useUIStore, type PaneType } from '@/stores/uiStore';

const PANE_LABELS: Record<PaneType, string> = {
  navigation: 'Navigation',
  chat: 'Chat',
  artifacts: 'Artifacts',
  editor: 'Editor',
  metadata: 'Details',
};

function LayoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function ChevronUp() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function PaneLayoutMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { paneOrder, paneVisibility, togglePane, reorderPanes } = useUIStore();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const movePane = (pane: PaneType, direction: 'up' | 'down') => {
    const newOrder = [...paneOrder];
    const idx = newOrder.indexOf(pane);
    if (direction === 'up' && idx > 0) {
      const temp = newOrder[idx - 1]!;
      newOrder[idx - 1] = newOrder[idx]!;
      newOrder[idx] = temp;
    } else if (direction === 'down' && idx < newOrder.length - 1) {
      const temp = newOrder[idx + 1]!;
      newOrder[idx + 1] = newOrder[idx]!;
      newOrder[idx] = temp;
    }
    reorderPanes(newOrder);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
          open
            ? 'bg-accent-muted text-accent'
            : 'text-text-muted hover:text-text hover:bg-surface/50',
        )}
        title="Layout"
      >
        <LayoutIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-border rounded-[var(--radius-sm)] shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
            Panes
          </div>
          {paneOrder.map((pane, i) => (
            <div
              key={pane}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent-muted/10"
            >
              {/* Toggle */}
              <button
                onClick={() => togglePane(pane)}
                className={cn(
                  'w-3 h-3 rounded-sm border transition-colors cursor-pointer',
                  paneVisibility[pane]
                    ? 'bg-accent border-accent'
                    : 'border-text-muted',
                )}
              />
              {/* Label */}
              <span className="text-xs font-mono text-text flex-1">
                {PANE_LABELS[pane]}
              </span>
              {/* Reorder */}
              <button
                onClick={() => movePane(pane, 'up')}
                disabled={i === 0}
                className="p-0.5 text-text-muted hover:text-text disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronUp />
              </button>
              <button
                onClick={() => movePane(pane, 'down')}
                disabled={i === paneOrder.length - 1}
                className="p-0.5 text-text-muted hover:text-text disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronDown />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
