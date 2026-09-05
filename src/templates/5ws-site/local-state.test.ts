import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEYS,
  clearAuth,
  clearModelConfig,
  dailyAvailable,
  defaultStorage,
  loadAuth,
  loadModelConfig,
  markDailyPlayed,
  saveAuth,
  saveModelConfig,
  utcDay,
  type KeyValueStorage,
} from './src/lib/local-state';

function memoryStorage(): KeyValueStorage & { dump: () => Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

describe('the connected AI in localStorage', () => {
  it('round-trips a config and drops one without a key', () => {
    const s = memoryStorage();
    expect(loadModelConfig(s)).toBeNull();
    saveModelConfig(s, { provider: 'openai', apiKey: ' sk-1 ', model: 'gpt-5.6-sol' });
    expect(loadModelConfig(s)).toEqual({
      provider: 'openai',
      apiKey: 'sk-1',
      model: 'gpt-5.6-sol',
    });
    expect(Object.keys(s.dump())).toEqual([STORAGE_KEYS.model]);
    clearModelConfig(s);
    expect(loadModelConfig(s)).toBeNull();
  });

  it('ignores junk: a bad provider, an empty key, malformed JSON', () => {
    const s = memoryStorage();
    s.setItem(STORAGE_KEYS.model, JSON.stringify({ provider: 'mystery', apiKey: 'k' }));
    expect(loadModelConfig(s)).toBeNull();
    s.setItem(STORAGE_KEYS.model, JSON.stringify({ provider: 'anthropic', apiKey: '   ' }));
    expect(loadModelConfig(s)).toBeNull();
    s.setItem(STORAGE_KEYS.model, '{not json');
    expect(loadModelConfig(s)).toBeNull();
    // The managed provider needs no key
    s.setItem(STORAGE_KEYS.model, JSON.stringify({ provider: 'crux' }));
    expect(loadModelConfig(s)).toEqual({ provider: 'crux' });
  });
});

describe('sign-in tokens', () => {
  it('round-trips and clears', () => {
    const s = memoryStorage();
    expect(loadAuth(s)).toBeNull();
    saveAuth(s, { accessToken: 'a', refreshToken: 'r', email: 'x@y.z', name: 'ada' });
    expect(loadAuth(s)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      email: 'x@y.z',
      name: 'ada',
    });
    // A sign-in without the account's name (from before names were kept) does not count
    s.setItem(
      STORAGE_KEYS.auth,
      JSON.stringify({ accessToken: 'a', refreshToken: 'r', email: 'x@y.z' }),
    );
    expect(loadAuth(s)).toBeNull();
    saveAuth(s, { accessToken: 'a', refreshToken: 'r', email: 'x@y.z', name: 'ada' });
    s.setItem(STORAGE_KEYS.auth, JSON.stringify({ refreshToken: 'r' }));
    expect(loadAuth(s)).toBeNull();
    clearAuth(s);
    expect(s.getItem(STORAGE_KEYS.auth)).toBeNull();
  });
});

describe('the daily figure', () => {
  it('is the UTC day, so everyone gets the same figure on the same day', () => {
    expect(utcDay(new Date('2026-09-05T23:30:00-05:00'))).toBe('2026-09-06');
    expect(utcDay(new Date('2026-09-05T03:00:00+09:00'))).toBe('2026-09-04');
  });

  it('is available once per shelf per UTC day; the rest is practice', () => {
    const s = memoryStorage();
    const d1 = new Date('2026-09-05T10:00:00Z');
    expect(dailyAvailable(s, 'history', d1)).toBe(true);
    markDailyPlayed(s, 'history', d1);
    expect(dailyAvailable(s, 'history', d1)).toBe(false);
    expect(dailyAvailable(s, 'things', d1)).toBe(true); // another shelf, another daily
    expect(dailyAvailable(s, 'history', new Date('2026-09-06T00:00:01Z'))).toBe(true);
    expect(s.dump()[STORAGE_KEYS.daily + 'history']).toBe('2026-09-05');
  });
});

describe('defaultStorage', () => {
  it('falls back to memory when there is no localStorage', () => {
    const s = defaultStorage();
    s.setItem('5ws:t', '1');
    expect(s.getItem('5ws:t')).toBe('1');
    s.removeItem('5ws:t');
    expect(s.getItem('5ws:t')).toBeNull();
  });
});
