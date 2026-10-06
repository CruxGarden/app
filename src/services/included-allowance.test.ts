import { describe, expect, it } from 'vitest';
import type { IncludedUsage } from '@/api/inference';
import { composerAllowance, formatRelease, remainingLine, spendByCrux } from './included-allowance';

const window5 = (remaining: number, release: string | null = '2026-10-05T15:00:00Z') => ({
  durationHours: 5,
  limitMicrodollars: 750_000,
  usedMicrodollars: 750_000 - remaining,
  remainingMicrodollars: remaining,
  nextReleaseAt: release,
});
const window30 = (remaining: number, release: string | null = '2026-10-20T09:00:00Z') => ({
  durationHours: 720,
  limitMicrodollars: 4_000_000,
  usedMicrodollars: 4_000_000 - remaining,
  remainingMicrodollars: remaining,
  nextReleaseAt: release,
});
const usage = (patch: Partial<IncludedUsage>): IncludedUsage =>
  ({ windows: [window5(600_000), window30(3_500_000)], ...patch }) as IncludedUsage;
const next = (fits: boolean, fullLengthFits: boolean, minimumMicrodollars = 50_000) => ({
  contextTokens: 120_000,
  minimumMicrodollars,
  fits,
  fullLengthFits,
});

describe('composer allowance', () => {
  it('pauses when the next request does not fit, even with allowance left', () => {
    // CR02: a long conversation stops fitting at 50–70 % used.
    const result = composerAllowance(
      usage({ windows: [window5(40_000), window30(3_000_000)], nextRequest: next(false, false) }),
    );
    expect(result).toEqual({ kind: 'paused', until: '2026-10-05T15:00:00Z' });
  });
  it('waits for the latest window that is short when both are', () => {
    const result = composerAllowance(
      usage({ windows: [window5(10_000), window30(20_000)], nextRequest: next(false, false) }),
    );
    expect(result).toEqual({ kind: 'paused', until: '2026-10-20T09:00:00Z' });
  });
  it('says replies may be shorter when only a short reply fits', () => {
    expect(composerAllowance(usage({ nextRequest: next(true, false) }))).toEqual({
      kind: 'shorter',
      until: '2026-10-05T15:00:00Z',
    });
  });
  it('warns at 80 % used and is otherwise quiet', () => {
    expect(
      composerAllowance(
        usage({ windows: [window5(100_000), window30(3_500_000)], nextRequest: next(true, true) }),
      ),
    ).toEqual({ kind: 'nearly' });
    expect(composerAllowance(usage({ nextRequest: next(true, true) }))).toEqual({ kind: 'ok' });
  });
  it('falls back to "nothing left" on a server without nextRequest', () => {
    expect(composerAllowance(usage({ windows: [window5(0), window30(10)] })).kind).toBe('paused');
    expect(composerAllowance(usage({})).kind).toBe('ok');
  });
});

describe('remaining in plain units', () => {
  it('names the window with least left', () => {
    expect(remainingLine(usage({ windows: [window5(1_100_000), window30(900_000)] }))).toBe(
      '$0.90 left in your 30-day allowance',
    );
    expect(remainingLine(usage({}))).toBe('$0.60 left in your 5-hour allowance');
    expect(remainingLine(usage({ windows: [] }))).toBeNull();
  });
  it('writes a release later today as a time only', () => {
    const now = new Date('2026-10-05T10:00:00');
    expect(formatRelease('2026-10-05T15:30:00', now)).not.toMatch(/Oct|Mon|Tue/);
    expect(formatRelease('2026-10-20T15:30:00', now)).toMatch(/Oct/);
  });
});

describe('where it went', () => {
  it('groups by Crux with chat and images apart, unknown and unattributed as Other', () => {
    const titles: Record<string, string> = { a: 'Home page', b: 'Banner' };
    const rows = spendByCrux(
      [
        { cruxId: 'a', kind: 'chat', microdollars: 300_000, requests: 4 },
        { cruxId: 'a', kind: 'image', microdollars: 500_000, requests: 1 },
        { cruxId: 'b', kind: 'chat', microdollars: 900_000, requests: 9 },
        { cruxId: null, kind: 'chat', microdollars: 100_000, requests: 1 },
        { cruxId: 'deleted', kind: 'image', microdollars: 200_000, requests: 1 },
      ],
      (id) => titles[id],
    );
    expect(rows.map((r) => r.title)).toEqual(['Banner', 'Home page', 'Other']);
    expect(rows[1]).toMatchObject({ chatMicrodollars: 300_000, imageMicrodollars: 500_000 });
    expect(rows[2]).toMatchObject({
      key: 'other',
      chatMicrodollars: 100_000,
      imageMicrodollars: 200_000,
      requests: 2,
    });
  });
});
