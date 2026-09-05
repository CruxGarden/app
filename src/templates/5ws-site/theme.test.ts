import { describe, it, expect } from 'vitest';
import {
  applyTheme,
  currentThemeChoice,
  loadTheme,
  nextTheme,
  resolveTheme,
  saveTheme,
  themeToggleLabel,
  THEME_KEY,
} from './src/lib/theme';

function memory(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('theme: system → light → dark, remembered', () => {
  it('cycles in that order and wraps', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('system follows the OS; an explicit choice does not', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('defaults to system, ignores junk, and round-trips through storage', () => {
    const s = memory();
    expect(loadTheme(s)).toBe('system');
    s.setItem(THEME_KEY, 'amber'); // the retired phosphor value
    expect(loadTheme(s)).toBe('system');
    saveTheme(s, 'dark');
    expect(s.getItem('5ws:theme')).toBe('dark');
    expect(loadTheme(s)).toBe('dark');
  });

  it('applies both attributes: what shows, and what was picked', () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute: (n: string, v: string) => void attrs.set(n, v),
      getAttribute: (n: string) => attrs.get(n) ?? null,
    };
    expect(applyTheme(root, 'system', true)).toBe('dark');
    expect(attrs.get('data-theme')).toBe('dark');
    expect(attrs.get('data-theme-choice')).toBe('system');
    expect(currentThemeChoice(root)).toBe('system');
    applyTheme(root, 'light', true);
    expect(attrs.get('data-theme')).toBe('light');
    expect(currentThemeChoice({ getAttribute: () => null })).toBe('system');
  });

  it('names the toggle by its state and its next state', () => {
    expect(themeToggleLabel('system')).toBe('Theme: System — switch to light');
    expect(themeToggleLabel('dark')).toBe('Theme: Dark — switch to system');
  });
});
