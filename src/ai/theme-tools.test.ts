import { describe, it, expect, beforeEach } from 'vitest';
import { THEME_TOOL_DEFINITIONS, runThemeTool } from './theme-tools';
import { defaultToolDefinitions, createToolExecutor } from './tools';
import {
  getThemeOverrides,
  getThemePreview,
  setThemePreview,
  setThemeOverrides,
} from '@/lib/moods/active';
import { initServices } from '@/services';
import { getSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

describe('theme tools', () => {
  beforeEach(async () => {
    await initServices();
    setThemePreview(null);
    setThemeOverrides('Dark', {});
  });

  it('are offered to every workspace conversation', () => {
    const names = defaultToolDefinitions().map((t) => t.name);
    expect(names).toContain('set_theme');
    expect(names).toContain('get_theme');
    expect(names).toContain('set_background');
    for (const t of THEME_TOOL_DEFINITIONS) expect(t.input_schema.type).toBe('object');
  });

  it('get_theme lists groups, then values for a group', async () => {
    const groups = (await runThemeTool('get_theme', {})) as string;
    expect(groups).toMatch(/- layout — Shape & layout: .*paneGap/);
    expect(groups).toMatch(/- pane-workshop — Workshop pane/);
    const layout = (await runThemeTool('get_theme', { group: 'layout' })) as string;
    expect(layout).toMatch(/paneGap \(length, Pane gap\): 4px/);
    expect(await runThemeTool('get_theme', { group: 'nope' })).toMatch(/Unknown group/);
  });

  it('set_theme preview is transient and never saved', async () => {
    const out = await runThemeTool('set_theme', { tokens: { accent: '#ff2d95' } });
    expect(out).toMatch(/Preview applied/);
    expect(getThemePreview()).toEqual({ accent: '#ff2d95' });
    expect(getThemeOverrides('Dark')).toEqual({});
    // merges
    await runThemeTool('set_theme', { tokens: { paneGap: '0px' } });
    expect(getThemePreview()).toEqual({ accent: '#ff2d95', paneGap: '0px' });
    await runThemeTool('set_theme', { reset: true });
    expect(getThemePreview()).toEqual({});
  });

  it('set_theme persist writes the user theme and can remove tokens', async () => {
    await runThemeTool('set_theme', { tokens: { paneWorkshopBody: '#112233' }, mode: 'persist' });
    expect(getThemeOverrides('Dark')).toEqual({ paneWorkshopBody: '#112233' });
    const shown = (await runThemeTool('get_theme', { group: 'pane-workshop' })) as string;
    expect(shown).toMatch(/paneWorkshopBody .*#112233 \[saved\]/);
    await runThemeTool('set_theme', {
      tokens: { paneWorkshopBody: '' },
      mode: 'persist',
      reset: true,
    });
    // '' is not a value, so the key is treated as "named" for removal via reset
    await runThemeTool('set_theme', { mode: 'persist', reset: true });
    expect(getThemeOverrides('Dark')).toEqual({});
  });

  it('set_background switches built-in backgrounds and explains bad input', async () => {
    expect(await runThemeTool('set_background', { type: 'drift' })).toBe(
      'Background set to drift.',
    );
    expect(getSetting(SettingsKey.BackgroundType)).toBe('drift');
    expect(await runThemeTool('set_background', { type: 'lava' })).toMatch(/unknown type/);
    expect(await runThemeTool('set_background', {})).toMatch(/prompt .* path .* type/);
    expect(await runThemeTool('set_background', { path: 'x.png' })).toMatch(/needs a workspace/);
    expect(await runThemeTool('set_background', { path: 'x.png' }, { cruxId: 'nope' })).toMatch(
      /no file at "x.png"/,
    );
    // No image provider key in the test env → a clear, actionable error
    expect(await runThemeTool('set_background', { prompt: 'rain over neon streets' })).toMatch(
      /No API key configured/,
    );
    await runThemeTool('set_background', { type: 'bloom' });
  });

  it('rejects unknown tokens and tells the model where to look', async () => {
    const out = (await runThemeTool('set_theme', { tokens: { neonness: '11' } })) as string;
    expect(out).toMatch(/unknown token\(s\): neonness/);
    expect(out).toMatch(/get_theme/);
  });

  it('runs through the crux-bound executor too', async () => {
    const exec = createToolExecutor('crux-1');
    const out = (await exec('set_theme', { tokens: { accent: '#00f0ff' } })) as string;
    expect(out).toMatch(/Preview applied/);
    expect(getThemePreview().accent).toBe('#00f0ff');
  });
});
