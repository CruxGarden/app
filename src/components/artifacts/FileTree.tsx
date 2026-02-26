import { cn } from '@/lib/cn';
import type { Attachment } from '@/api/types';

interface FileTreeProps {
  artifacts: Attachment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function FileTree({
  artifacts,
  selectedId,
  onSelect,
}: FileTreeProps) {
  if (artifacts.length === 0) {
    return (
      <div className="p-3 text-xs text-text-muted">
        No files yet. Ask the AI to create one.
      </div>
    );
  }

  return (
    <div className="py-1">
      {artifacts.map((a) => {
        const path = a.meta?.path || a.filename || a.id;
        const name = path.split('/').pop() || path;

        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono',
              'transition-colors cursor-pointer text-left',
              selectedId === a.id
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface',
            )}
            title={path}
          >
            <FileIcon />
            <span className="truncate">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
