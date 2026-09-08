import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

/**
 * Drag a Gateway component anywhere on the screen (Daniel, 2026-09-07: "why
 * don't you let me drag the player and banner components anywhere I want").
 * The position is kept as the centre point in fractions of the window, so it
 * lands in the same place at any window size, and it persists (a sync setting,
 * readable before services init). Double-click puts it back where it started.
 * Buttons, sliders and inputs inside still work: a press on one never drags.
 */
/**
 * A free piece keeps its centre in fractions of the window; an anchored piece
 * (the player, to the banner) keeps its centre as a pixel offset from the
 * anchor's centre, so the distance between them is the same on every screen.
 */
type Pos = { cx: number; cy: number } | { dx: number; dy: number };
type Layout = Record<string, Pos>;
const MOVED_EVENT = 'crux:gateway-piece-moved';

function readLayout(): Layout {
  try {
    const raw = getSetting(SettingsKey.GatewayLayout);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Layout) : {};
  } catch {
    return {};
  }
}
function writeLayout(layout: Layout) {
  setSetting(SettingsKey.GatewayLayout, Object.keys(layout).length ? JSON.stringify(layout) : '');
}

const INTERACTIVE = 'button, a, input, select, textarea, [role="slider"], [role="switch"]';

export default function Draggable({
  id,
  className,
  children,
  label,
  handle = false,
  riseDelayMs = 0,
  anchorId,
}: {
  /** Key in the saved layout */
  id: string;
  /** Where it sits until dragged (positioning classes) */
  className?: string;
  children: ReactNode;
  label: string;
  /** Show a grip to drag by (for a piece that is all controls, like the player) */
  handle?: boolean;
  /** Fade in a beat after the others (ms) */
  riseDelayMs?: number;
  /** Keep the position relative to this piece (its `id`) rather than the window */
  anchorId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anchored = !!anchorId;
  const [pos, setPos] = useState<Pos | null>(() => {
    const saved = readLayout()[id];
    if (!saved) return null;
    // a position saved in the other mode (free vs anchored) is discarded
    return anchored === 'dx' in saved ? saved : null;
  });
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [, setTick] = useState(0);

  const anchorCenter = useCallback(() => {
    const el = anchorId
      ? document.querySelector<HTMLElement>(`[data-testid="gateway-${anchorId}"]`)
      : null;
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [anchorId]);

  /** Centre point in px from a saved position. */
  const toPx = useCallback(
    (p: Pos) => {
      if ('dx' in p) {
        const a = anchorCenter();
        return { x: a.x + p.dx, y: a.y + p.dy };
      }
      return { x: p.cx * window.innerWidth, y: p.cy * window.innerHeight };
    },
    [anchorCenter],
  );
  /** Saved position from a centre point in px, kept on screen. */
  const fromPx = useCallback(
    (x: number, y: number): Pos => {
      const el = ref.current;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cx = Math.min(W - w / 2 - 4, Math.max(w / 2 + 4, x));
      const cy = Math.min(H - h / 2 - 4, Math.max(h / 2 + 4, y));
      if (anchored) {
        const a = anchorCenter();
        return { dx: cx - a.x, dy: cy - a.y };
      }
      return { cx: cx / W, cy: cy / H };
    },
    [anchored, anchorCenter],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // offset from the pointer to the element's centre, so it does not jump
    drag.current = {
      dx: r.left + r.width / 2 - e.clientX,
      dy: r.top + r.height / 2 - e.clientY,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    setPos(fromPx(e.clientX + d.dx, e.clientY + d.dy));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    if (!d?.moved) return;
    setPos((p) => {
      if (p) writeLayout({ ...readLayout(), [id]: p });
      return p;
    });
  };
  const reset = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    setPos(null);
    const layout = readLayout();
    delete layout[id];
    writeLayout(layout);
  };

  // Tell anchored pieces after the DOM has the new position (an effect runs
  // after commit; a dispatch inside the handler would be read a frame early)
  useEffect(() => {
    window.dispatchEvent(new Event(MOVED_EVENT));
  }, [pos]);

  // Follow the window (and, anchored, the anchor) when either moves
  useEffect(() => {
    const follow = () => setTick((t) => t + 1);
    const onResize = () => {
      setPos((p) =>
        p && !('dx' in p) ? fromPx(p.cx * window.innerWidth, p.cy * window.innerHeight) : p,
      );
      follow();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener(MOVED_EVENT, follow);
    // the anchor exists only after the first paint
    const first = requestAnimationFrame(follow);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener(MOVED_EVENT, follow);
      cancelAnimationFrame(first);
    };
  }, [fromPx]);

  const placed = pos && typeof window !== 'undefined' ? toPx(pos) : null;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-testid={`gateway-${id}`}
      data-placed={pos ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={reset}
      title="Drag to move · double-click to put back"
      className={cn(
        'gateway-piece touch-none select-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        handle && 'flex items-center gap-1',
        pos ? 'fixed z-40' : className,
      )}
      style={
        {
          ...(placed
            ? {
                left: `${placed.x}px`,
                top: `${placed.y}px`,
                transform: 'translate(-50%, -50%)',
              }
            : riseDelayMs
              ? { transitionDelay: `${riseDelayMs}ms` }
              : {}),
          WebkitAppRegion: 'no-drag',
        } as unknown as React.CSSProperties
      }
    >
      {handle && (
        <span
          aria-hidden
          data-testid={`gateway-${id}-grip`}
          className="text-text-muted/70 text-xs leading-none px-0.5"
          title="Drag to move"
        >
          ⋮⋮
        </span>
      )}
      {children}
    </div>
  );
}
