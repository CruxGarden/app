import { cn } from '@/lib/cn';
import { getFileIcon } from '@/components/artifacts/fileIcons';
import type { EditorTab } from '@/stores/uiStore';

interface EditorTabBarProps {
  tabs: EditorTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function EditorTabBar({ tabs, activeId, onSelect, onClose }: EditorTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center overflow-x-auto bg-bg/30">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono shrink-0',
              'border-r border-border transition-colors cursor-pointer',
              'group relative',
              isActive
                ? 'bg-surface/50 text-text'
                : 'text-text-muted hover:text-text hover:bg-surface/20',
            )}
            title={tab.path}
          >
            {tab.dirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            )}
            {getFileIcon(tab.name)}
            <span className="truncate max-w-[120px]">{tab.name}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onClose(tab.id);
                }
              }}
              className={cn(
                'ml-1 p-0.5 rounded transition-colors',
                'opacity-0 group-hover:opacity-100',
                'hover:bg-error-muted hover:text-error',
              )}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}
