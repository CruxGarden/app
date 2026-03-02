interface PublicTopBarProps {
  title?: string;
  username: string;
  hasHistory?: boolean;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
}

export default function PublicTopBar({
  title,
  username,
  hasHistory,
  historyOpen,
  onToggleHistory,
}: PublicTopBarProps) {
  return (
    <header className="relative z-20 flex items-center justify-between h-8 px-3 border-b border-border bg-surface-solid shrink-0">
      <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-mono">
        <a href="https://crux.garden" className="shrink-0 text-text-muted hover:underline">
          crux.garden
        </a>
        <span className="text-text-muted/40">/</span>
        <a href={`/@${username}`} className="shrink-0 text-text-muted hover:underline">
          @{username}
        </a>
        {title && (
          <>
            <span className="text-text-muted/40">/</span>
            <span className="text-text truncate">{title}</span>
          </>
        )}
      </div>

      {hasHistory && onToggleHistory && (
        <button
          onClick={onToggleHistory}
          className={`shrink-0 flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-sm transition-colors cursor-pointer ${
            historyOpen
              ? 'text-accent bg-accent-muted'
              : 'text-text-muted hover:text-text hover:bg-surface'
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          How was this made?
        </button>
      )}
    </header>
  );
}
