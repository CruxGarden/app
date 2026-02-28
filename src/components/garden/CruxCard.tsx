import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { Crux } from '@/api/types';

interface CruxCardProps {
  crux: Crux;
  linkTo?: string;
  onDelete?: (id: string) => void;
  sortBy?: 'created' | 'updated';
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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date}, ${time}`;
}

export default function CruxCard({ crux, linkTo, onDelete, sortBy = 'created' }: CruxCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const description = crux.meta?.summary?.purpose || crux.description;

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
          'group-hover:bg-accent-muted group-hover:text-accent group-hover:border-accent transition-all duration-200 cursor-pointer',
          'w-full h-36 flex flex-col',
        )}
      >
        {/* Title */}
        <h3 className="font-display text-sm font-medium text-text truncate pr-6">
          {crux.title || crux.slug}
        </h3>

        {/* Description */}
        {description && (
          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed mt-1.5">
            {description}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="text-[10px] text-text-muted font-mono">
          {sortBy === 'updated'
            ? `Updated ${formatDateTime(crux.updated)}`
            : `Created ${formatDateTime(crux.created)}`}
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
