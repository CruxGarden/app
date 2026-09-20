import { describe, it, expect, vi } from 'vitest';
import { describeRun } from './native-tools';

vi.mock('@/lib/platform', () => ({
  Capability: { NativeTools: 'nativeTools', Build: 'build' },
  can: (c: string) => c === 'nativeTools',
}));

describe('native tools, step 1', () => {
  it('validates run_ffmpeg like any other tool (the host executor rejected it as unknown)', async () => {
    const { validateToolInput } = await import('@/ai/validation');
    expect(validateToolInput('run_ffmpeg', { args: ['-version'] }).valid).toBe(true);
    expect(validateToolInput('run_ffmpeg', { args: [] }).valid).toBe(false);
    expect(validateToolInput('run_ffmpeg', { args: ['-i', 3] }).valid).toBe(false);
    expect(validateToolInput('run_ffmpeg', {}).valid).toBe(false);
  });

  it('describes a run the way the collaborator and the pane report it', () => {
    expect(describeRun(['-i', 'a.webm', 'a.mp4'], { code: 0, ms: 1234, stderrTail: '' })).toBe(
      'ffmpeg -i a.webm a.mp4 — done in 1.2s.',
    );
    expect(
      describeRun(['-i', 'a.webm'], { code: 1, ms: 50, stderrTail: 'a.webm: No such file\n' }),
    ).toBe('ffmpeg exited 1 after 0.1s.\na.webm: No such file');
  });

  it('validates capture_preview and render_video (step 5)', async () => {
    const { validateToolInput } = await import('@/ai/validation');
    expect(validateToolInput('render_video', {}).valid).toBe(true);
    expect(validateToolInput('render_video', { fps: 30, max_seconds: 10, name: 'ad' }).valid).toBe(
      true,
    );
    expect(validateToolInput('render_video', { fps: 0 }).valid).toBe(false);
    expect(validateToolInput('capture_preview', { path: 'https://x' }).valid).toBe(false);
    expect(validateToolInput('capture_preview', { path: '../x.html' }).valid).toBe(false);
    expect(validateToolInput('capture_preview', { path: 'about.html' }).valid).toBe(true);
  });

  it('offers the native and capture tools only where the platform can run them', async () => {
    const { defaultToolDefinitions, NATIVE_TOOL_DEFINITIONS } = await import('@/ai/tools');
    expect(NATIVE_TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'run_ffmpeg',
      'run_magick',
      'run_pandoc',
      'probe_media',
      'media_tools',
    ]);
    const names = defaultToolDefinitions().map((t) => t.name);
    expect(names).toContain('run_ffmpeg');
    expect(names).toContain('run_pandoc');
    expect(names).toContain('media_tools');
    expect(names).toContain('capture_preview');
    expect(names).toContain('render_video');
    expect(names).not.toContain('check_site');
  });
});
