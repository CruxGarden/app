import { describe, expect, it } from 'vitest';
import { setupWorkspaceLayout, startingActivity } from './setup-workspace';
import { getMosaicLeaves } from '@/stores/uiStore';
import { rankLocalModels } from './local-model-fit';

describe('first workspace', () => {
  it('follows a changed starting point instead of giving unrelated instructions', () => {
    expect(startingActivity('notes', 'app')).toBe('writing');
    expect(startingActivity('private-requests', 'writing')).toBe('app');
    expect(startingActivity('hello-world', 'exploring')).toBe('exploring');
    expect(startingActivity('blank', 'writing')).toBe('exploring');
    expect(startingActivity('custom-tool', 'app')).toBe('exploring');
  });
  it('gives hands-on creative work the entire Workshop, regardless of technical preference', () => {
    for (const need of ['writing', 'music', 'art', 'game'] as const)
      for (const advancedMode of [false, true])
        expect(setupWorkspaceLayout({ need, advancedMode, aiEnabled: false, width: 1400 })).toBe(
          'workshop',
        );
  });
  it('adds backend panels only for an advanced app, with or without AI', () => {
    for (const aiEnabled of [false, true]) {
      const layout = setupWorkspaceLayout({
        need: 'app',
        advancedMode: true,
        aiEnabled,
        width: 1400,
      });
      expect(getMosaicLeaves(layout)).toEqual(
        aiEnabled
          ? ['collaboration', 'artifacts', 'store', 'workshop']
          : ['artifacts', 'store', 'workshop'],
      );
      expect(
        getMosaicLeaves(
          setupWorkspaceLayout({ need: 'app', advancedMode: false, aiEnabled, width: 1400 }),
        ),
      ).not.toContain('store');
    }
  });
  it('stacks on narrow windows, retaining the creation as the largest panel', () => {
    expect(
      setupWorkspaceLayout({ need: 'website', advancedMode: true, aiEnabled: true, width: 800 }),
    ).toMatchObject({ direction: 'column', first: 'workshop', splitPercentage: 68 });
  });
});
describe('local model fit', () => {
  it('does not add separate VRAM to RAM or pretend unknown GPU memory was measured', () => {
    const ranked = rankLocalModels({
      memoryBytes: 16 * 1024 ** 3,
      unifiedMemory: false,
      gpuMemoryBytes: 8 * 1024 ** 3,
    });
    expect(ranked[0]!.name).toBe('qwen3:4b');
    expect(ranked[0]!.fit).toBe('accelerated');
    expect(
      rankLocalModels({
        memoryBytes: 16 * 1024 ** 3,
        unifiedMemory: true,
        gpuMemoryBytes: null,
      })[0]!.name,
    ).toBe('qwen3:8b');
    expect(rankLocalModels(null).every((m) => m.fit === 'unknown')).toBe(true);
    expect(
      rankLocalModels({
        memoryBytes: 4 * 1024 ** 3,
        unifiedMemory: false,
        gpuMemoryBytes: null,
      }).every((m) => m.fit === 'tight'),
    ).toBe(true);
  });
});
