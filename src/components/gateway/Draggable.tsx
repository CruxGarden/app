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
type Layout = Record<string, { cx: number; cy: number }>;

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
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ cx: number; cy: number } | null>(() => readLayout()[id] ?? null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback((cx: number, cy: number) => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = Math.min(W - w / 2 - 4, Math.max(w / 2 + 4, cx * W));
    const y = Math.min(H - h / 2 - 4, Math.max(h / 2 + 4, cy * H));
    return { cx: x / W, cy: y / H };
  }, []);

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
    setPos(clamp((e.clientX + d.dx) / window.innerWidth, (e.clientY + d.dy) / window.innerHeight));
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

  // Keep it on screen when the window shrinks
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.cx, p.cy) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

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
          ...(pos
            ? {
                left: `${pos.cx * 100}%`,
                top: `${pos.cy * 100}%`,
                transform: 'translate(-50%, -50%)',
                // a placed piece keeps its own transform (the stage fades it by
                // opacity and blur only, see .gateway-stage in globals.css)
                transition: 'opacity 900ms ease-in-out, filter 900ms ease-in-out',
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
