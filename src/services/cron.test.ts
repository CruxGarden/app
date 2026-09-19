import { describe, it, expect } from 'vitest';
import { cronError, describeCron, nextCron, parseCron } from './cron';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('cron', () => {
  it('parses stars, lists, ranges, steps and names', () => {
    const f = parseCron('*/15 9-17 1,15 jan-mar mon-fri');
    expect([...f.minute]).toEqual([0, 15, 30, 45]);
    expect([...f.hour]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...f.dom]).toEqual([1, 15]);
    expect([...f.month]).toEqual([1, 2, 3]);
    expect([...f.dow]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseCron('0 0 * * 7').dow]).toEqual([0]);
  });

  it('refuses what it cannot read, and says why', () => {
    expect(cronError('0 9 * *')).toMatch(/five fields/);
    expect(cronError('60 9 * * *')).toMatch(/minute/);
    expect(cronError('0 9 * * fun')).toMatch(/Unknown name/);
    expect(cronError('0 9 0 * *')).toMatch(/day/);
    expect(cronError('0 9 * * *')).toBeNull();
  });

  it('finds the next occurrence in local time', () => {
    // Friday 2026-09-18 10:30 → 09:00 the next weekday is Monday the 21st
    expect(nextCron('0 9 * * mon-fri', local(2026, 9, 18, 10, 30))).toEqual(local(2026, 9, 21, 9));
    // every 15 minutes: 10:30 → 10:45
    expect(nextCron('*/15 * * * *', local(2026, 9, 18, 10, 30))).toEqual(
      local(2026, 9, 18, 10, 45),
    );
    // exactly on a match, "after" is strict
    expect(nextCron('30 10 * * *', local(2026, 9, 18, 10, 30))).toEqual(local(2026, 9, 19, 10, 30));
    // month rollover, first of the month at midnight
    expect(nextCron('0 0 1 * *', local(2026, 9, 18, 10, 30))).toEqual(local(2026, 10, 1));
    // day-of-month OR day-of-week when both are set (Vixie rule)
    expect(nextCron('0 9 20 * sat', local(2026, 9, 18, 10, 30))).toEqual(local(2026, 9, 19, 9));
    // nothing ever matches
    expect(nextCron('0 0 31 feb *', local(2026, 9, 18))).toBeNull();
  });

  it('describes common shapes plainly', () => {
    expect(describeCron('0 9 * * *')).toBe('every day at 09:00');
    expect(describeCron('30 9 * * mon-fri')).toBe('weekdays at 09:30');
    expect(describeCron('0 18 * * fri')).toBe('Fri at 18:00');
    expect(describeCron('*/10 * * * *')).toBe('every 10 minutes');
    expect(describeCron('0 */6 * * *')).toBe('every 6 hours');
    expect(describeCron('0 * * * *')).toBe('every hour');
    expect(describeCron('0 9 1 * *')).toBe('the 1st of every month at 09:00');
    expect(describeCron('5 4 * jan *')).toBe('5 4 * jan *');
    expect(describeCron('nonsense')).toBe('nonsense');
  });
});
