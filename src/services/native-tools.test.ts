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

  it('offers run_ffmpeg only where the platform can run native tools', async () => {
    const { defaultToolDefinitions, NATIVE_TOOL_DEFINITIONS } = await import('@/ai/tools');
    expect(NATIVE_TOOL_DEFINITIONS.map((t) => t.name)).toEqual(['run_ffmpeg']);
    const names = defaultToolDefinitions().map((t) => t.name);
    expect(names).toContain('run_ffmpeg');
    expect(names).not.toContain('check_site');
  });
});
