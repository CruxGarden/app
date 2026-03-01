import { cn } from '@/lib/cn';

interface Tab {
  id: string;
  name: string;
  path: string;
}

interface FileTabsProps {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function FileTabs({ tabs, activeId, onSelect, onClose }: FileTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border overflow-x-auto scrollbar-hide">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono',
            'border-r border-border shrink-0 cursor-pointer',
            'transition-colors',
            tab.id === activeId
              ? 'bg-surface text-accent'
              : 'text-text-muted hover:text-text hover:bg-surface/50',
          )}
          onClick={() => onSelect(tab.id)}
          title={tab.path}
        >
          <span className="truncate max-w-[120px]">{tab.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-sm',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'hover:bg-error-muted hover:text-error cursor-pointer',
              tab.id === activeId && 'opacity-60',
            )}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
