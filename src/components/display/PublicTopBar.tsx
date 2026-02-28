interface PublicTopBarProps {
  title?: string;
  username: string;
}

export default function PublicTopBar({ title, username }: PublicTopBarProps) {
  return (
    <header className="flex items-center h-8 px-3 border-b border-border/50 bg-surface/20 backdrop-blur-[var(--glass-blur)] shrink-0">
      <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-mono">
        <a href="https://crux.garden" className="shrink-0 text-text-muted hover:text-text transition-colors">
          crux.garden
        </a>
        <span className="text-text-muted/40">/</span>
        <a href={`/@${username}`} className="shrink-0 text-text-muted hover:text-text transition-colors">@{username}</a>
        {title && (
          <>
            <span className="text-text-muted/40">/</span>
            <span className="text-text truncate">{title}</span>
          </>
        )}
      </div>
    </header>
  );
}
