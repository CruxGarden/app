import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveUserPreset,
  getUserPresets,
  deleteUserPreset,
  allPresets,
  toThemeFile,
  parseThemeFile,
} from './user-presets';
import { MOOD_PRESETS } from './presets';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

describe('user presets', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.MoodUserPresets, '');
  });

  it('saves a standalone look, lists it after the built-ins, deletes it', () => {
    const saved = saveUserPreset({
      name: 'Sunset Terminal',
      section: 'Dark',
      overrides: { accent: '#ff6a1a', bogus: 'x' },
      author: 'daniel',
    });
    expect(saved.id).toBe('user-sunset-terminal');
    expect(saved.overrides).toEqual({ accent: '#ff6a1a' }); // unknown keys dropped
    expect(getUserPresets()).toHaveLength(1);
    expect(allPresets().at(-1)?.id).toBe('user-sunset-terminal');
    expect(allPresets()).toHaveLength(MOOD_PRESETS.length + 1);
    // same name → replaces
    saveUserPreset({ name: 'Sunset Terminal', section: 'Dark', overrides: { accent: '#000000' } });
    expect(getUserPresets()).toHaveLength(1);
    expect(getUserPresets()[0]!.overrides.accent).toBe('#000000');
    deleteUserPreset('user-sunset-terminal');
    expect(getUserPresets()).toEqual([]);
  });

  it('round-trips a theme file and tolerates the older shapes', () => {
    const file = toThemeFile({
      name: 'Blade',
      section: 'Dark',
      overrides: { accent: '#ff6a1a' },
      author: 'daniel',
    });
    expect(file.format).toBe('crux-mood-theme');
    const back = parseThemeFile(JSON.stringify(file));
    expect(back).toMatchObject({ name: 'Blade', section: 'Dark', author: 'daniel' });
    expect(back?.overrides).toEqual({ accent: '#ff6a1a' });
    // legacy {overrides} export and a bare map
    expect(parseThemeFile(JSON.stringify({ overrides: { paneGap: '0px' } }))?.overrides).toEqual({
      paneGap: '0px',
    });
    expect(parseThemeFile(JSON.stringify({ paneGap: '2px', nope: 1 }))?.overrides).toEqual({
      paneGap: '2px',
    });
    expect(parseThemeFile('not json')).toBeNull();
  });
});
