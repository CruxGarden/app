import { afterEach, expect, it, vi } from 'vitest';
import {
  APPEARANCE_TOKENS,
  appAppearanceSnapshot,
  appearanceChoice,
  setAppearanceChoice,
} from './app-appearance';
const settings = new Map<string, string>();
vi.mock('./settings', () => ({
  getSetting: (key: string) => settings.get(key),
  setSetting: (key: string, value: string) => settings.set(key, value),
  flushSettings: async () => {},
}));
vi.mock('@/lib/moods/active', () => ({ composeMoodPalette: () => ({}) }));
vi.mock('@/lib/moods/assets', () => ({
  getAssets: () => [],
  isAssetRef: () => false,
  refFingerprint: () => '',
  FONT_FACE_FAMILIES: {},
}));
afterEach(() => vi.unstubAllGlobals());
it('defaults to Garden and isolates the persisted choice by Working Copy', async () => {
  expect(appearanceChoice('one')).toBe('garden');
  await setAppearanceChoice('one', 'app');
  expect(appearanceChoice('one')).toBe('app');
  expect(appearanceChoice('two')).toBe('garden');
  await expect(setAppearanceChoice('one', 'unknown')).rejects.toThrow('Choose');
});
it('sends only explicit visual tokens, never persona, backgrounds or credentials', async () => {
  vi.stubGlobal('document', {
    documentElement: { classList: { contains: (value: string) => value === 'light' } },
  });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) =>
      name === '--accent' ? '#123456' : name === '--font-face-body' ? 'none' : '',
  }));
  const result = await appAppearanceSnapshot('two');
  expect(result.mode).toBe('light');
  expect(result.tokens.accent).toBe('#123456');
  expect(Object.keys(result.tokens)).toEqual(Object.keys(APPEARANCE_TOKENS));
  expect(result.fonts).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/persona|apiKey|backgroundImage/);
});
