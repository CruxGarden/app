import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLeasePool } from './lease';

describe('createLeasePool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function pool(graceMs = 1000) {
    const stopped: string[] = [];
    const p = createLeasePool({ graceMs, stop: (key) => void stopped.push(key) });
    return { p, stopped };
  }

  it('does not stop while a lease is held', () => {
    const { p, stopped } = pool();
    p.acquire('a');
    p.acquire('a');
    expect(p.count('a')).toBe(2);

    p.release('a');
    vi.advanceTimersByTime(5000);
    expect(stopped).toEqual([]); // one holder remains
    expect(p.count('a')).toBe(1);
  });

  it('stops after the last release, once the grace period passes', () => {
    const { p, stopped } = pool(1000);
    p.acquire('a');
    p.release('a');

    vi.advanceTimersByTime(999);
    expect(stopped).toEqual([]); // still inside the grace window

    vi.advanceTimersByTime(1);
    expect(stopped).toEqual(['a']);
  });

  it('a re-acquire during the grace period cancels the shutdown (the tab switch)', () => {
    const { p, stopped } = pool(1000);
    p.acquire('a'); // tab 1 mounts
    p.release('a'); // tab 1 unmounts
    vi.advanceTimersByTime(500);
    p.acquire('a'); // tab 2 mounts before the grace elapses

    vi.advanceTimersByTime(5000);
    expect(stopped).toEqual([]); // server was never restarted
    expect(p.count('a')).toBe(1);
  });

  it('keys are independent', () => {
    const { p, stopped } = pool(100);
    p.acquire('a');
    p.acquire('b');
    p.release('a');
    vi.advanceTimersByTime(200);
    expect(stopped).toEqual(['a']);
    expect(p.count('b')).toBe(1);
  });

  it('releasing an unheld key never goes negative and stops at most once', () => {
    const { p, stopped } = pool(100);
    p.release('ghost');
    p.release('ghost');
    vi.advanceTimersByTime(200);
    expect(p.count('ghost')).toBe(0);
    expect(stopped).toEqual(['ghost']);
  });

  it('reset cancels pending shutdowns', () => {
    const { p, stopped } = pool(100);
    p.acquire('a');
    p.release('a');
    p.reset();
    vi.advanceTimersByTime(500);
    expect(stopped).toEqual([]);
    expect(p.count('a')).toBe(0);
  });

  it('reports stop failures instead of throwing into the timer', () => {
    const errors: unknown[] = [];
    const p = createLeasePool({
      graceMs: 10,
      stop: () => Promise.reject(new Error('stop failed')),
      onStopError: (_key, err) => errors.push(err),
    });
    p.acquire('a');
    p.release('a');
    vi.advanceTimersByTime(20);
    return Promise.resolve().then(() => {
      expect(errors).toHaveLength(1);
    });
  });
});
