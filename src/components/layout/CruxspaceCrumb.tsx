import { useCallback, useEffect, useRef, useState } from 'react';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useActiveCruxspaces } from '@/hooks/useActiveCruxspaces';
import { useDismiss } from '@/hooks/useDismiss';
import { ChevronRightIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/**
 * The Cruxspace step of the breadcrumb — Garden › Cruxspace › Crux — shown
 * while the Crux on screen belongs to one. Its menu lists every Cruxspace
 * in the Garden (the current one marked) and the way back to the Garden, so
 * moving between Cruxspaces, the Cruxes in one, and the Garden is all done
 * in the one place (Daniel, 2026-09-19).
 */
export default function CruxspaceCrumb() {
  const navigate = useMoodNavigate();
  const { all, mine, current } = useActiveCruxspaces();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    barRef.current = menuRef.current?.closest<HTMLElement>('.bg-toolbar') ?? null;
  }, [open]);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);
  if (!current) return null;
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };
  return (
    <>
      <div ref={menuRef} className="relative min-w-0" data-testid="cruxspace-crumb">
        <button
          type="button"
          aria-label="Switch Cruxspace"
          aria-haspopup="menu"
          aria-expanded={open}
          title={
            mine.length > 1
              ? `In ${mine.map((s) => s.name).join(', ')}`
              : `Cruxspace ${current.name}`
          }
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-display text-toolbar-text truncate max-w-48 cursor-pointer px-2 py-1 rounded-[var(--radius-sm)] hover:bg-action-button-hover focus-visible:outline-2 focus-visible:outline-accent"
        >
          {current.name} ▾{mine.length > 1 ? ` (${mine.length})` : ''}
        </button>
        {open && (
          <div className="absolute left-0 top-full w-56 pt-2 z-50" data-plasma-host="left">
            <PlasmaOverlay
              surfaces={[
                {
                  ref: barRef,
                  radius: 14,
                  fuse: true,
                  formIn: false,
                  elevation: 0.5,
                  claim: true,
                },
                { ref: panelRef, radius: 12, fuse: true, elevation: 0.5 },
              ]}
              zIndex={-1}
              canvasStyle={{ position: 'fixed' }}
            />
            <div
              ref={panelRef}
              role="menu"
              aria-label="Cruxspaces"
              className="bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown py-1"
            >
              <p className="px-3 pt-1.5 pb-1 text-xxs font-mono uppercase tracking-wider text-text-muted">
                Cruxspaces
              </p>
              <div className="max-h-[50vh] overflow-auto">
                {all.map((s) => {
                  const here = mine.some((m) => m.id === s.id);
                  return (
                    <button
                      key={s.id}
                      role="menuitem"
                      aria-current={s.id === current.id ? 'true' : undefined}
                      onClick={() => go(`/home?space=${encodeURIComponent(s.id)}`)}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm hover:bg-accent-muted transition-colors cursor-pointer',
                        here ? 'text-text' : 'text-text-muted hover:text-text',
                      )}
                    >
                      <span className="block truncate">
                        {s.id === current.id ? '✓ ' : ''}
                        {s.name}
                      </span>
                      <span className="block text-xxs text-text-muted truncate">
                        {s.cruxIds.length} {s.cruxIds.length === 1 ? 'Crux' : 'Cruxes'}
                        {here && s.id !== current.id ? ' · this Crux is here too' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="divider my-1" />
              <button
                role="menuitem"
                onClick={() => go('/home')}
                className="w-full px-3 py-2 text-left text-sm text-text-muted hover:text-text hover:bg-accent-muted transition-colors cursor-pointer"
              >
                Your garden
              </button>
            </div>
          </div>
        )}
      </div>
      <span className="text-toolbar-text-muted shrink-0">
        <ChevronRightIcon />
      </span>
    </>
  );
}
