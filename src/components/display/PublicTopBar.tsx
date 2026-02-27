import { Link } from 'react-router-dom';
import CruxBloom from '@/components/brand/CruxBloom';

interface PublicTopBarProps {
  title?: string;
  username: string;
  showHistory: boolean;
  onToggleHistory: () => void;
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function PublicTopBar({ title, username, showHistory, onToggleHistory }: PublicTopBarProps) {
  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-surface/30 backdrop-blur-[var(--glass-blur)] shrink-0">
      {/* Left: branding + title */}
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" className="shrink-0">
          <CruxBloom size={20} />
        </Link>
        {title && (
          <h1 className="text-sm font-display font-medium text-text truncate">
            {title}
          </h1>
        )}
      </div>

      {/* Center: author */}
      <span className="text-xs font-mono text-text-muted hidden sm:block">
        @{username}
      </span>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleHistory}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono
            rounded-[var(--radius-sm)] transition-colors cursor-pointer
            ${showHistory
              ? 'bg-accent-muted text-accent'
              : 'text-text-muted hover:text-text hover:bg-surface/50'
            }
          `}
        >
          <HistoryIcon />
          <span className="hidden sm:inline">Conversation</span>
        </button>
        <Link
          to="/garden"
          className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded-[var(--radius-sm)] hover:brightness-110 transition-all"
        >
          Create your own
        </Link>
      </div>
    </header>
  );
}
