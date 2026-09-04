import { describe, it, expect } from 'vitest';
import { periodDay } from './period-day';

describe('periodDay', () => {
  it('formats a UTC period bound as its own day', () => {
    expect(periodDay('2026-09-01T00:00:00.000Z', 'en-US')).toBe('Sep 1');
    expect(periodDay('2026-08-01', 'en-US')).toBe('Aug 1');
  });
  it('shows a dash for null, empty or invalid input', () => {
    expect(periodDay(null)).toBe('—');
    expect(periodDay(undefined)).toBe('—');
    expect(periodDay('')).toBe('—');
    expect(periodDay('not-a-date')).toBe('—');
  });
});
