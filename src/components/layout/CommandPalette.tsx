import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { cruxes } from '@/api';
import type { Crux } from '@/api/types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Crux[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search cruxes
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      // Load recent cruxes when no query
      setLoading(true);
      cruxes.list({ limit: 8 }).then(({ data }) => {
        setResults(data);
        setSelected(0);
        setLoading(false);
      }).catch(() => setLoading(false));
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      cruxes.list({ search: query, limit: 8 }).then(({ data }) => {
        setResults(data);
        setSelected(0);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, 200);
  }, [query, open]);

  const handleSelect = useCallback(
    (crux: Crux) => {
      onClose();
      navigate(`/crux/${crux.id}`);
    },
    [navigate, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selected]) handleSelect(results[selected]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-bg/60" />
      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-[var(--radius)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search cruxes..."
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none font-body"
          />
          <kbd className="text-[10px] font-mono text-text-muted bg-surface-solid px-1.5 py-0.5 rounded border border-border">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto py-1">
          {loading && results.length === 0 ? (
            <div className="px-4 py-6 text-xs text-text-muted text-center">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-xs text-text-muted text-center">
              {query ? 'No cruxes found' : 'No cruxes yet'}
            </div>
          ) : (
            results.map((crux, i) => (
              <button
                key={crux.id}
                onClick={() => handleSelect(crux)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer',
                  i === selected ? 'bg-accent-muted' : 'hover:bg-surface-solid',
                )}
              >
                <CruxIcon />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-body text-text truncate">
                    {crux.title || crux.slug}
                  </div>
                  {crux.meta?.summary?.purpose && (
                    <div className="text-xs text-text-muted truncate mt-0.5">
                      {crux.meta.summary.purpose}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] font-mono text-text-muted">
          <span><kbd className="px-1 py-0.5 bg-surface-solid rounded border border-border">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-surface-solid rounded border border-border">↵</kbd> open</span>
          <span><kbd className="px-1 py-0.5 bg-surface-solid rounded border border-border">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function CruxIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
