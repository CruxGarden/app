import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Where the window was (EF08): its normal bounds plus whether it was maximized
 * or full screen, in a small JSON beside the rest of the profile (userData, so
 * an isolated test profile keeps its own). The geometry is pure — given the
 * saved state and the displays connected now, `restoreWindowState` answers
 * where the window opens — so a missing monitor, a smaller screen or a damaged
 * file is decided without Electron (e2e/window-state.unit.spec.ts).
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: Rect;
  maximized: boolean;
  fullscreen: boolean;
}

export interface WindowDefaults {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export interface RestoredWindow {
  /** Absent x/y: let the OS place (centre) the window. */
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}

/** How much of the window must still be on a display for its position to be kept. */
const MIN_VISIBLE = { width: 120, height: 60 };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Anything that is not a well-formed state reads as "no saved state". */
export function parseWindowState(raw: unknown): WindowState | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<WindowState>;
  const b = state.bounds as Partial<Rect> | undefined;
  if (!b || !finite(b.x) || !finite(b.y) || !finite(b.width) || !finite(b.height)) return null;
  if (b.width <= 0 || b.height <= 0) return null;
  return {
    bounds: {
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.round(b.width),
      height: Math.round(b.height),
    },
    maximized: state.maximized === true,
    fullscreen: state.fullscreen === true,
  };
}

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * The saved window fitted to a display that is connected now. `workAreas`
 * lists every display's work area, the primary first. A window whose display
 * is gone (or that is all but off every screen) keeps its size and is centred
 * on the primary display; one that only overhangs is moved back inside.
 */
export function restoreWindowState(
  saved: WindowState | null,
  workAreas: Rect[],
  defaults: WindowDefaults,
): RestoredWindow {
  const fallback: RestoredWindow = {
    width: defaults.width,
    height: defaults.height,
    maximized: false,
    fullscreen: false,
  };
  if (!saved) return fallback;
  const areas = workAreas.filter((a) => a && a.width > 0 && a.height > 0);
  if (!areas.length) return fallback;

  let home: Rect | null = null;
  let best = 0;
  for (const area of areas) {
    const seen = overlap(saved.bounds, area);
    const enough =
      seen.width >= Math.min(MIN_VISIBLE.width, saved.bounds.width) &&
      seen.height >= Math.min(MIN_VISIBLE.height, saved.bounds.height);
    if (enough && seen.width * seen.height > best) {
      best = seen.width * seen.height;
      home = area;
    }
  }
  const area = home ?? areas[0]!;
  // Never larger than the screen; never smaller than the window allows.
  const width = Math.max(defaults.minWidth, Math.min(saved.bounds.width, area.width));
  const height = Math.max(defaults.minHeight, Math.min(saved.bounds.height, area.height));
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);
  return {
    x: home
      ? clamp(saved.bounds.x, area.x, maxX)
      : area.x + Math.max(0, Math.round((area.width - width) / 2)),
    y: home
      ? clamp(saved.bounds.y, area.y, maxY)
      : area.y + Math.max(0, Math.round((area.height - height) / 2)),
    width,
    height,
    maximized: saved.maximized,
    fullscreen: saved.fullscreen,
  };
}

/** The file itself. A read never throws; a failed write is not worth a crash. */
export class WindowStateFile {
  readonly file: string;
  constructor(userData: string) {
    this.file = path.join(userData, 'window-state.json');
  }
  read(): WindowState | null {
    try {
      return parseWindowState(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return null;
    }
  }
  write(state: WindowState): void {
    try {
      const temporary = `${this.file}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(state));
      fs.renameSync(temporary, this.file);
    } catch {
      /* The next move or resize tries again. */
    }
  }
}

/** The slice of BrowserWindow the tracker uses. */
export interface TrackedWindow {
  on(event: string, listener: () => void): unknown;
  isDestroyed(): boolean;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  isMinimized(): boolean;
  getNormalBounds(): Rect;
}

/**
 * Save as the window settles (debounced) and when it closes. `held` is true
 * while something else is placing the window on purpose (the companion-app
 * layout beside Figma or Blender): those bounds are a temporary arrangement,
 * not where the person keeps the window, so nothing is recorded meanwhile.
 * Returns `flush`, which writes at once.
 */
export function trackWindowState(
  win: TrackedWindow,
  store: Pick<WindowStateFile, 'write'>,
  options: { held?: () => boolean; debounceMs?: number; initial?: WindowState | null } = {},
): () => void {
  const delay = options.debounceMs ?? 400;
  let last: WindowState | null = options.initial ?? null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const capture = () => {
    if (win.isDestroyed() || options.held?.()) return;
    const maximized = win.isMaximized();
    const fullscreen = win.isFullScreen();
    // A minimized window reports nothing useful; keep what was known.
    if (win.isMinimized() && last) return;
    last = { bounds: win.getNormalBounds(), maximized, fullscreen };
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    capture();
    if (last && !options.held?.()) store.write(last);
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };
  for (const event of [
    'resize',
    'move',
    'maximize',
    'unmaximize',
    'enter-full-screen',
    'leave-full-screen',
  ])
    win.on(event, schedule);
  win.on('close', flush);
  return flush;
}
