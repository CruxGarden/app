import { test, expect } from '@playwright/test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WindowStateFile,
  parseWindowState,
  restoreWindowState,
  trackWindowState,
  type Rect,
  type WindowState,
} from '../src/window-state';

/** Remembered window bounds (EF08): the geometry and the file, without Electron. */
const DEFAULTS = { width: 1400, height: 900, minWidth: 800, minHeight: 600 };
const LAPTOP: Rect = { x: 0, y: 25, width: 1512, height: 944 };
const EXTERNAL: Rect = { x: 1512, y: 0, width: 2560, height: 1415 };
const state = (bounds: Rect, extra: Partial<WindowState> = {}): WindowState => ({
  bounds,
  maximized: false,
  fullscreen: false,
  ...extra,
});

test.describe('restoring the window', () => {
  test('no saved state opens at the default size and lets the OS place it', () => {
    expect(restoreWindowState(null, [LAPTOP], DEFAULTS)).toEqual({
      width: 1400,
      height: 900,
      maximized: false,
      fullscreen: false,
    });
  });

  test('a window that fits comes back exactly where it was', () => {
    const saved = state({ x: 100, y: 80, width: 1000, height: 700 }, { maximized: true });
    expect(restoreWindowState(saved, [LAPTOP], DEFAULTS)).toEqual({
      x: 100,
      y: 80,
      width: 1000,
      height: 700,
      maximized: true,
      fullscreen: false,
    });
  });

  test('a window on a second display stays on that display', () => {
    const saved = state({ x: 2000, y: 200, width: 1600, height: 1000 });
    expect(restoreWindowState(saved, [LAPTOP, EXTERNAL], DEFAULTS)).toMatchObject({
      x: 2000,
      y: 200,
      width: 1600,
      height: 1000,
    });
  });

  test('a monitor that is gone: the window keeps its size, centred on the primary display', () => {
    const saved = state({ x: 2000, y: 200, width: 1200, height: 800 }, { fullscreen: true });
    const restored = restoreWindowState(saved, [LAPTOP], DEFAULTS);
    expect(restored).toEqual({
      x: Math.round((1512 - 1200) / 2),
      y: 25 + Math.round((944 - 800) / 2),
      width: 1200,
      height: 800,
      maximized: false,
      fullscreen: true,
    });
  });

  test('a window larger than the screen now is shrunk to the work area', () => {
    const saved = state({ x: 1600, y: 100, width: 2400, height: 1300 });
    const restored = restoreWindowState(saved, [LAPTOP], DEFAULTS);
    expect(restored).toMatchObject({ x: 0, y: 25, width: 1512, height: 944 });
  });

  test('a window hanging off an edge is moved back inside', () => {
    const saved = state({ x: 1000, y: 600, width: 1000, height: 700 });
    const restored = restoreWindowState(saved, [LAPTOP], DEFAULTS);
    expect(restored).toMatchObject({ x: 512, y: 25 + 944 - 700, width: 1000, height: 700 });
  });

  test('a sliver left on screen does not count as on screen', () => {
    const saved = state({ x: -980, y: 100, width: 1000, height: 700 });
    const restored = restoreWindowState(saved, [LAPTOP], DEFAULTS);
    expect(restored.x).toBe(Math.round((1512 - 1000) / 2));
  });

  test('never smaller than the minimum size', () => {
    const saved = state({ x: 10, y: 40, width: 200, height: 100 });
    expect(restoreWindowState(saved, [LAPTOP], DEFAULTS)).toMatchObject({
      width: 800,
      height: 600,
    });
  });

  test('no usable display falls back to the defaults', () => {
    const saved = state({ x: 10, y: 40, width: 1000, height: 700 });
    expect(restoreWindowState(saved, [], DEFAULTS)).toMatchObject({ width: 1400, height: 900 });
    expect(
      restoreWindowState(saved, [{ x: 0, y: 0, width: 0, height: 0 }], DEFAULTS).x,
    ).toBeUndefined();
  });
});

test.describe('the saved file', () => {
  test('damaged or foreign content reads as nothing saved', () => {
    for (const raw of [
      '',
      '{',
      'null',
      '[]',
      '{"bounds":null}',
      '{"bounds":{"x":"1","y":2,"width":3,"height":4}}',
      '{"bounds":{"x":1,"y":2,"width":0,"height":4}}',
      '{"bounds":{"x":1,"y":2,"width":1e999,"height":4}}',
    ])
      expect(parseWindowState(raw), raw).toBeNull();
    expect(
      parseWindowState('{"bounds":{"x":1.4,"y":2,"width":900,"height":700},"maximized":"yes"}'),
    ).toEqual({
      bounds: { x: 1, y: 2, width: 900, height: 700 },
      maximized: false,
      fullscreen: false,
    });
  });

  test('round-trips under the profile directory; a missing or corrupt file is not an error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crux-window-state-'));
    const file = new WindowStateFile(dir);
    expect(file.file).toBe(join(dir, 'window-state.json'));
    expect(file.read()).toBeNull();
    const saved = state({ x: 5, y: 6, width: 1000, height: 700 }, { maximized: true });
    file.write(saved);
    expect(file.read()).toEqual(saved);
    expect(existsSync(`${file.file}.tmp`)).toBe(false);
    writeFileSync(file.file, '{"bounds":');
    expect(file.read()).toBeNull();
    // A profile that has gone away must not throw from a resize handler.
    new WindowStateFile(join(dir, 'missing', 'deeper')).write(saved);
  });
});

class FakeWindow extends EventEmitter {
  bounds: Rect = { x: 10, y: 20, width: 1000, height: 700 };
  maximized = false;
  fullscreen = false;
  minimized = false;
  destroyed = false;
  isDestroyed = () => this.destroyed;
  isMaximized = () => this.maximized;
  isFullScreen = () => this.fullscreen;
  isMinimized = () => this.minimized;
  getNormalBounds = () => this.bounds;
}

test.describe('tracking the window', () => {
  test('moves and resizes are saved once they settle, and at once on close', async () => {
    const win = new FakeWindow();
    const writes: WindowState[] = [];
    trackWindowState(win, { write: (s) => writes.push(s) }, { debounceMs: 20 });
    win.emit('resize');
    win.emit('move');
    win.emit('resize');
    expect(writes).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(writes).toEqual([state(win.bounds)]);
    win.bounds = { x: 30, y: 40, width: 1100, height: 720 };
    win.maximized = true;
    win.emit('maximize');
    win.emit('close');
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(state(win.bounds, { maximized: true }));
    // The pending timer was folded into the close.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(writes).toHaveLength(2);
  });

  test('a companion layout holding the window records nothing', async () => {
    const win = new FakeWindow();
    const writes: WindowState[] = [];
    let held = true;
    const flush = trackWindowState(
      win,
      { write: (s) => writes.push(s) },
      { debounceMs: 5, held: () => held },
    );
    win.bounds = { x: 0, y: 25, width: 420, height: 900 };
    win.emit('resize');
    await new Promise((resolve) => setTimeout(resolve, 30));
    win.emit('close');
    expect(writes).toHaveLength(0);
    held = false;
    win.bounds = { x: 10, y: 20, width: 1000, height: 700 };
    flush();
    expect(writes).toEqual([state(win.bounds)]);
  });

  test('a minimized window keeps the last known place', () => {
    const win = new FakeWindow();
    const writes: WindowState[] = [];
    const initial = state({ x: 1, y: 2, width: 900, height: 650 });
    trackWindowState(win, { write: (s) => writes.push(s) }, { initial });
    win.minimized = true;
    win.bounds = { x: -32000, y: -32000, width: 160, height: 28 };
    win.emit('close');
    expect(writes).toEqual([initial]);
  });

  test('writes through the real file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crux-window-state-'));
    const win = new FakeWindow();
    trackWindowState(win, new WindowStateFile(dir))();
    expect(JSON.parse(readFileSync(join(dir, 'window-state.json'), 'utf8'))).toEqual(
      state(win.bounds),
    );
  });
});
