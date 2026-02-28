import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import type { Crux } from '@/api/types';

interface CruxCardProps {
  crux: Crux;
  linkTo?: string;
  onDelete?: (id: string) => void;
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function GateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      <circle cx="12" cy="5" r="3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function CruxCard({ crux, linkTo, onDelete }: CruxCardProps) {
  const navigate = useNavigate();
  const author = useAuthStore((s) => s.author);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPublished = crux.meta?.publishedAt != null;
  const publicUrl = isPublished && author ? `/@${author.username}/${crux.slug}` : null;

  const gateCount = crux.meta?.gateCount || 0;
  const summary = crux.meta?.summary;
  const lastGateLabel = summary?.stage;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="relative group">
      <button
        onClick={() => navigate(linkTo || `/crux/${crux.id}`)}
        className={cn(
          'bg-panel border border-border rounded-[var(--radius)] p-4 text-left',
          'hover:border-accent/30 hover:bg-surface/50 transition-all duration-200 cursor-pointer',
          'w-full flex flex-col gap-2',
        )}
      >
        {/* Title */}
        <h3 className="font-display text-sm font-medium text-text truncate pr-6">
          {crux.title || crux.slug}
        </h3>

        {/* Summary purpose or description */}
        {(summary?.purpose || crux.description) && (
          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
            {summary?.purpose || crux.description}
          </p>
        )}

        {/* Last gate label */}
        {lastGateLabel && (
          <p className="text-[11px] text-accent/70 font-mono truncate">
            {lastGateLabel}
          </p>
        )}

        {/* Footer: stats + timestamp */}
        <div className="flex items-center justify-between mt-1 text-[10px] text-text-muted font-mono">
          <div className="flex items-center gap-3">
            {gateCount > 0 && (
              <span className="flex items-center gap-1">
                <GateIcon />
                {gateCount}
              </span>
            )}
            {crux.meta?.messages && crux.meta.messages.length > 0 && (
              <span className="flex items-center gap-1">
                <FileIcon />
                {crux.meta.messages.filter((m) => m.toolCalls?.some((tc) => tc.name === 'write_file')).length}
              </span>
            )}
          </div>
          <span>{formatRelativeTime(crux.updated)}</span>
        </div>
      </button>

      {/* Three-dot menu */}
      {onDelete && (
        <div ref={menuRef} className="absolute top-3 right-3 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className={cn(
              'p-1 rounded text-text-muted hover:text-text hover:bg-surface transition-all cursor-pointer',
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-surface-solid border border-border rounded-[var(--radius-sm)] shadow-xl py-1 z-50">
              {publicUrl && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block w-full px-3 py-1.5 text-left text-xs text-text hover:bg-accent-muted/20 transition-colors cursor-pointer"
                >
                  View public
                </a>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(crux.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-error hover:bg-error-muted transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
