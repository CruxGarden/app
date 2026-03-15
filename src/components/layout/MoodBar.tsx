import { useState, useCallback, useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { getSetting, setSetting } from '@/services/settings';
import { cn } from '@/lib/cn';

const BG_KEY = 'cruxgarden:backgroundType';

export default function MoodBar() {
  const resolved = useThemeStore((s) => s.resolved);

  const [bgType, setBgType] = useState<string>(() => {
    return getSetting(BG_KEY) || 'bloom';
  });

  useEffect(() => {
    const saved = getSetting(BG_KEY);
    if (saved && saved !== 'bloom') {
      document.documentElement.style.setProperty('--background-type', saved);
    }
  }, []);

  const toggleBg = useCallback((type: string) => {
    document.documentElement.style.setProperty('--background-type', type);
    setBgType(type);
    setSetting(BG_KEY, type);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-30 flex items-center gap-1 p-1 rounded-[var(--radius)] bg-panel border border-panel-border">
      <div className="relative group/blank">
        <button
          onClick={() => toggleBg('blank')}
          className={cn(
            'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
            bgType === 'blank' ? 'text-accent bg-accent-muted' : 'text-panel-text-muted hover:text-accent hover:bg-accent-muted',
          )}
        >
          <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
            <rect x="1" y="1" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
          </svg>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/blank:block">
          <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-tooltip border border-tooltip-border shadow-lg whitespace-nowrap">
            <span className="text-xs font-medium text-tooltip-text">Blank</span>
          </div>
        </div>
      </div>
      {resolved === 'dark' && (
        <>
          <div className="relative group/drift">
            <button
              onClick={() => toggleBg('drift')}
              className={cn(
                'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                bgType === 'drift' ? 'text-accent bg-accent-muted' : 'text-panel-text-muted hover:text-accent hover:bg-accent-muted',
              )}
            >
              <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
                <circle cx="4" cy="3" r="1" fill="currentColor" opacity="0.7" />
                <circle cx="16" cy="11" r="0.8" fill="currentColor" opacity="0.5" />
                <circle cx="10" cy="7" r="1.5" fill="currentColor" opacity="0.4" />
                <circle cx="14" cy="4" r="0.6" fill="currentColor" opacity="0.3" />
                <circle cx="7" cy="10" r="0.7" fill="currentColor" opacity="0.5" />
                <circle cx="17" cy="7" r="0.5" fill="currentColor" opacity="0.2" />
                <circle cx="3" cy="8" r="0.4" fill="currentColor" opacity="0.25" />
              </svg>
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/drift:block">
              <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-tooltip border border-tooltip-border shadow-lg whitespace-nowrap">
                <span className="text-xs font-medium text-tooltip-text">Drift</span>
              </div>
            </div>
          </div>
          <div className="relative group/flow">
            <button
              onClick={() => toggleBg('flowfield')}
              className={cn(
                'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                bgType === 'flowfield' ? 'text-accent bg-accent-muted' : 'text-panel-text-muted hover:text-accent hover:bg-accent-muted',
              )}
            >
              <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
                <path d="M2 8 C5 4, 8 4, 10 7 S15 12, 18 8" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.6" />
                <path d="M1 11 C4 7, 7 6, 10 9 S14 14, 19 10" stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.35" />
                <path d="M3 5 C6 2, 9 2, 12 5 S16 9, 19 5" stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.4" />
              </svg>
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/flow:block">
              <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-tooltip border border-tooltip-border shadow-lg whitespace-nowrap">
                <span className="text-xs font-medium text-tooltip-text">Flow</span>
              </div>
            </div>
          </div>
        </>
      )}
      <div className="relative group/bloom">
        <button
          onClick={() => toggleBg('bloom')}
          className={cn(
            'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
            bgType === 'bloom' ? 'text-accent bg-accent-muted' : 'text-panel-text-muted hover:text-accent hover:bg-accent-muted',
          )}
        >
          <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
            <circle cx="6" cy="5" r="4" fill="currentColor" opacity="0.4" />
            <circle cx="14" cy="9" r="4" fill="currentColor" opacity="0.25" />
            <circle cx="10" cy="4" r="3" fill="currentColor" opacity="0.15" />
          </svg>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/bloom:block">
          <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-tooltip border border-tooltip-border shadow-lg whitespace-nowrap">
            <span className="text-xs font-medium text-tooltip-text">Bloom</span>
          </div>
        </div>
      </div>
    </div>
  );
}
