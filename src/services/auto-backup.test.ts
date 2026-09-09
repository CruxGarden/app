import { describe, it, expect, vi } from 'vitest';
import { AutoBackupScheduler, isOverLimit } from './auto-backup';

function harness(over: Partial<ConstructorParameters<typeof AutoBackupScheduler>[0]> = {}) {
  vi.useFakeTimers();
  const backups: string[] = [];
  let gardens = 0;
  let paused: string | null = null;
  let last: number | null = null;
  const s = new AutoBackupScheduler({
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    backupCrux: async (id) => {
      backups.push(id);
    },
    backupGarden: async () => {
      gardens += 1;
      last = Date.now();
    },
    enabled: () => true,
    signedIn: () => true,
    lastGardenBackupAt: () => last,
    paused: () => paused,
    pause: (r) => {
      paused = r;
    },
    quietMs: 1000,
    ...over,
  });
  return { s, backups, gardens: () => gardens, paused: () => paused };
}

describe('automatic backup scheduler', () => {
  it('backs a crux up once it has been quiet, coalescing a burst of snapshots', async () => {
    const h = harness();
    h.s.cruxChanged('a');
    await vi.advanceTimersByTimeAsync(600);
    h.s.cruxChanged('a'); // still working — the clock restarts
    await vi.advanceTimersByTimeAsync(600);
    expect(h.backups).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.backups).toEqual(['a']);
    expect(h.s.pending()).toBe(0);
  });

  it('two cruxes are two backups; off, signed out or paused means none', async () => {
    const h = harness();
    h.s.cruxChanged('a');
    h.s.cruxChanged('b');
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.backups.sort()).toEqual(['a', 'b']);
    const off = harness({ enabled: () => false });
    off.s.cruxChanged('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(off.backups).toEqual([]);
    const out = harness({ signedIn: () => false });
    out.s.cruxChanged('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(out.backups).toEqual([]);
  });

  it('a plan limit pauses automatic backups with the server’s words; other failures just wait for the next change', async () => {
    const h = harness({
      backupCrux: async () => {
        throw { response: { status: 402, data: { message: 'Storage is full.' } } };
      },
    });
    h.s.cruxChanged('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.paused()).toBe('Storage is full.');
    h.s.cruxChanged('b');
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.s.pending()).toBe(0); // paused: nothing scheduled
    const flaky = harness({
      backupCrux: async () => {
        throw new Error('offline');
      },
    });
    flaky.s.cruxChanged('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(flaky.paused()).toBeNull();
  });

  it('the garden goes once a day, not on every tick', async () => {
    const h = harness();
    await h.s.tickGarden();
    await h.s.tickGarden();
    expect(h.gardens()).toBe(1);
    vi.setSystemTime(Date.now() + 25 * 60 * 60_000);
    await h.s.tickGarden();
    expect(h.gardens()).toBe(2);
  });

  it('recognises a 402 and nothing else', () => {
    expect(isOverLimit({ response: { status: 402, data: { message: 'Full' } } })).toBe('Full');
    expect(isOverLimit({ response: { status: 402 } })).toMatch(/storage is full/i);
    expect(isOverLimit({ response: { status: 500 } })).toBeNull();
    expect(isOverLimit(new Error('x'))).toBeNull();
  });
});
