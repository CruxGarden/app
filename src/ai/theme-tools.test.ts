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
