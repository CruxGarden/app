import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore } from '@/stores/uiStore';
import { getDockState, setDockState } from '@/services/resonance';
import { useShallow } from 'zustand/react/shallow';

/**
 * The Mood Dock — a small draggable widget over the workspace: the active
 * soundscape's transport and volume, what's playing, a way into the Mood
 * modal and Builder. Position and collapsed state persist per garden.
 */

const PILL_W = 300;
const PILL_H = 48;
const DISC = 44;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function LevelBars({ level, playing }: { level: number; playing: boolean }) {
  const bars = [0.35, 0.7, 1, 0.55];
  return (
    <span className="flex items-end gap-[2px] h-4 w-4" aria-hidden>
      {bars.map((k, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-accent transition-[height] duration-100"
          style={{
            height: `${Math.max(2, (playing ? Math.min(1, Math.sqrt(level) * 1.6) : 0.15) * k * 16)}px`,
          }}
        />
      ))}
    </span>
  );
}

export default function MoodDock() {
  const navigate = useNavigate();
  const { mixes, activeMixId, playing, volume, level, init, toggle, next, setVolume } =
    useAudioStore(
      useShallow((s) => ({
        mixes: s.mixes,
        activeMixId: s.activeMixId,
        playing: s.playing,
        volume: s.volume,
        level: s.level,
        init: s.init,
        toggle: s.toggle,
        next: s.next,
        setVolume: s.setVolume,
      })),
    );
  const mix = mixes.find((m) => m.id === activeMixId);

  const [pos, setPos] = useState(() => getDockState() ?? { x: -1, y: -1, collapsed: false });
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => init(), [init]);

  // Sitting along the bottom edge? Reserve that strip so panes are never
  // covered (the default). Dragged up into the workspace, it overlaps — the
  // user's call.
  useEffect(() => {
    if (pos.x < 0) return;
    const h = pos.collapsed ? DISC : PILL_H;
    const nearBottom = pos.y + h >= window.innerHeight - 28;
    useUIStore.getState().setDockReserve(nearBottom ? h + 24 : 0);
    return () => useUIStore.getState().setDockReserve(0);
  }, [pos.x, pos.y, pos.collapsed]);

  // First run: bottom-right, expanded
  useEffect(() => {
    if (pos.x >= 0) return;
    const w = pos.collapsed ? DISC : PILL_W;
    setPos((p) => ({ ...p, x: window.innerWidth - w - 20, y: window.innerHeight - PILL_H - 20 }));
  }, [pos.x, pos.collapsed]);

  const save = useCallback((p: { x: number; y: number; collapsed: boolean }) => {
    setPos(p);
    setDockState(p);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    dragging.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    moved.current = true;
    const w = pos.collapsed ? DISC : PILL_W;
    const h = pos.collapsed ? DISC : PILL_H;
    setPos((p) => ({
      ...p,
      x: clamp(e.clientX - dragging.current!.dx, 4, window.innerWidth - w - 4),
      y: clamp(e.clientY - dragging.current!.dy, 4, window.innerHeight - h - 4),
    }));
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = null;
    setDockState(pos);
  };

  // Keep it on screen when the window shrinks
  useEffect(() => {
    const onResize = () => {
      const w = pos.collapsed ? DISC : PILL_W;
      const h = pos.collapsed ? DISC : PILL_H;
      setPos((p) => ({
        ...p,
        x: clamp(p.x, 4, window.innerWidth - w - 4),
        y: clamp(p.y, 4, window.innerHeight - h - 4),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos.collapsed]);

  if (pos.x < 0) return null;

  if (pos.collapsed) {
    return (
      <div
        role="region"
        aria-label="Mood Dock"
        className="fixed z-30 select-none touch-none"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <button
          type="button"
          aria-label="Expand Mood Dock"
          title={mix ? `${mix.name}${playing ? ' — playing' : ''}` : 'Mood'}
          onClick={() => {
            if (moved.current) return;
            save({ ...pos, collapsed: false, x: clamp(pos.x, 4, window.innerWidth - PILL_W - 4) });
          }}
          className="w-11 h-11 rounded-full bg-surface-solid border border-border shadow-panel flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <LevelBars level={level} playing={playing} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Mood Dock"
      className={cn(
        'fixed z-30 select-none touch-none flex items-center gap-2 pl-2 pr-1.5',
        'rounded-full bg-surface-solid border border-border shadow-panel text-text',
        'cursor-grab active:cursor-grabbing',
      )}
      style={{ left: pos.x, top: pos.y, width: PILL_W, height: PILL_H }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <button
        type="button"
        onClick={() => useUIStore.getState().toggleMoodPanel()}
        title="Mood"
        aria-label="Open Mood"
        className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center cursor-pointer shrink-0"
      >
        <LevelBars level={level} playing={playing} />
      </button>

      <button
        type="button"
        onClick={() => void next()}
        title="Next mix"
        className="min-w-0 flex-1 text-left cursor-pointer"
      >
        <div className="text-[11px] font-body text-text truncate leading-tight">
          {mix?.name ?? 'No mix'}
        </div>
        <div className="text-[9px] font-mono text-text-muted truncate leading-tight">
          {playing ? 'playing' : 'paused'} · {mix?.layers.length ?? 0} layers
        </div>
      </button>

      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
        className="w-8 h-8 rounded-full bg-accent text-bg flex items-center justify-center cursor-pointer shrink-0 hover:brightness-110"
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 4l14 8-14 8z" />
          </svg>
        )}
      </button>

      <input
        type="range"
        aria-label="Soundscape volume"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className="w-16 accent-accent cursor-pointer"
      />

      <button
        type="button"
        onClick={() => navigate('/mood?tab=resonance')}
        title="Mixer"
        aria-label="Open the mixer"
        className="w-7 h-7 rounded-full text-text-muted hover:text-accent flex items-center justify-center cursor-pointer shrink-0"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => save({ ...pos, collapsed: true })}
        aria-label="Collapse Mood Dock"
        title="Collapse"
        className="w-6 h-6 rounded-full text-text-muted hover:text-text flex items-center justify-center cursor-pointer shrink-0 text-xs"
      >
        ›
      </button>
    </div>
  );
}
