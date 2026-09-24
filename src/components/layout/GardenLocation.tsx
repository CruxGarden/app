import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMatch } from 'react-router-dom';
import { gardenPath, useGardenContext } from '@/stores/gardenContext';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { gardenLocation } from '@/services/garden-navigation';
import { ChevronDownIcon, CloseIcon } from '@/components/ui/icons';

/** Location is a read-only sheet; opening it never closes or navigates the workspace. */
export default function GardenLocation() {
  const garden = useGardenContext((s) => s.garden);
  const revision = useGardenContext((s) => s.revision);
  const route = useMatch('/c/:id');
  const navigate = useMoodNavigate();
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof gardenLocation>> | null>(null);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 48, width: 320, maxHeight: 400 });
  const finish = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    setOpen(false);
  }, [garden?.id, route?.params.id]);
  useEffect(() => {
    if (!open || !garden) return;
    let cancelled = false;
    setResult(null);
    setError('');
    void gardenLocation(garden.id)
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, garden, revision, retry]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(320, innerWidth - 16);
      const top = Math.min(rect.bottom + 8, innerHeight - 88);
      setPosition({
        left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
        top,
        width,
        maxHeight: Math.max(80, innerHeight - top - 8),
      });
    };
    place();
    sheet.current?.focus();
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    observer.observe(trigger.current!.closest('header')!);
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !sheet.current?.contains(target)) setOpen(false);
    };
    // A successful retry can replace the focused button. Escape still belongs
    // to this sheet when browser focus falls back to the page.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener('keydown', escape, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      window.removeEventListener('resize', place);
      observer.disconnect();
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);
  const go = (id: string) => {
    finish();
    navigate(gardenPath(id));
  };
  const buttonClass =
    'w-full text-left px-3 py-2 rounded-[var(--radius-sm)] hover:bg-dropdown-item-hover focus:bg-dropdown-item-hover cursor-pointer break-words';
  return (
    <>
      <button
        ref={trigger}
        aria-label="Garden location"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!garden}
        onClick={() => setOpen(!open)}
        className="max-w-48 min-w-0 flex items-center gap-1 text-sm font-display text-toolbar-text px-2 py-1 hover:bg-action-button-hover rounded-[var(--radius-sm)] cursor-pointer"
      >
        <span className="truncate">{garden?.title || 'Garden'}</span>
        <ChevronDownIcon />
      </button>
      {open &&
        garden &&
        createPortal(
          <div
            ref={sheet}
            role="dialog"
            aria-label="Garden location"
            tabIndex={-1}
            style={position}
            className="fixed z-50 overflow-y-auto bg-dropdown backdrop-blur-xl text-dropdown-text text-sm border border-dropdown-border rounded-dropdown shadow-dropdown p-2"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finish();
              }
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                const buttons = [...sheet.current!.querySelectorAll<HTMLButtonElement>('button')];
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const index =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : ((current < 0 && event.key === 'ArrowUp' ? 0 : current) +
                          (event.key === 'ArrowDown' ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[index]?.focus();
              }
            }}
          >
            <div className="flex items-center justify-between px-3 py-1 text-text-muted">
              <h2 className="text-xs">Garden location</h2>
              <button
                aria-label="Close Garden location"
                onClick={finish}
                className="p-1 cursor-pointer hover:text-text"
              >
                <CloseIcon />
              </button>
            </div>
            {!result && !error && (
              <p role="status" className="px-3 py-2">
                Loading…
              </p>
            )}
            {error && (
              <div role="alert" className="px-3 py-2 text-error">
                {error}{' '}
                <button className="underline cursor-pointer" onClick={() => setRetry((n) => n + 1)}>
                  Retry
                </button>
              </div>
            )}
            {result && (
              <>
                {!!result.containers.length && (
                  <div className="border-b border-dropdown-border pb-2 mb-2">
                    <p className="px-3 py-2 text-xs text-text-muted">
                      More than one containing Garden. Choose one to visit.
                    </p>
                    {result.containers.map((item) => (
                      <button key={item.id} onClick={() => go(item.id)} className={buttonClass}>
                        {item.title || 'Untitled Garden'}
                      </button>
                    ))}
                  </div>
                )}
                <nav aria-label="Garden ancestry">
                  <ol>
                    {result.chain.map((item, index) => (
                      <li key={item.id} style={{ paddingLeft: Math.min(index, 6) * 12 }}>
                        <button
                          aria-current={item.id === garden.id ? 'location' : undefined}
                          onClick={() => go(item.id)}
                          className={buttonClass}
                        >
                          {item.title || 'Untitled Garden'}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              </>
            )}
            {route && (
              <div className="mt-2 pt-2 border-t border-dropdown-border">
                <button className={buttonClass} onClick={() => go(garden.id)}>
                  Close crux
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
