import { describe, expect, it } from 'vitest';
import {
  setupWorkspaceLayout,
  startingActivity,
  firstCruxLayout,
  walkthroughStep,
} from './setup-workspace';
import { getMosaicLeaves } from '@/stores/uiStore';
import { rankLocalModels } from './local-model-fit';

describe('first workspace', () => {
  it('uses the chosen creation for both its preview and actual layout, with blank retaining the interest', () => {
    const options = { need: 'writing' as const, advancedMode: true, aiEnabled: false, width: 1400 };
    expect(getMosaicLeaves(firstCruxLayout('private-requests', options))).toEqual([
      'artifacts',
      'store',
      'workshop',
    ]);
    expect(firstCruxLayout('notes', options)).toBe('workshop');
    expect(firstCruxLayout('blank', options)).toBe('workshop');
    expect(
      firstCruxLayout('private-requests', { ...options, width: 800, height: 950 }),
    ).toMatchObject({
      direction: 'column',
      first: 'workshop',
    });
  });
  it('resumes a valid tutorial step and ignores malformed imported progress', () => {
    expect(walkthroughStep(2)).toBe(2);
    for (const value of [undefined, null, '1', -1, 3, 1.5, NaN, {}])
      expect(walkthroughStep(value)).toBe(0);
  });
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
      setupWorkspaceLayout({
        need: 'website',
        advancedMode: true,
        aiEnabled: true,
        width: 800,
        height: 950,
      }),
    ).toMatchObject({
      direction: 'column',
      first: 'workshop',
      second: 'collaboration',
      splitPercentage: 55,
    });
    expect(
      setupWorkspaceLayout({
        need: 'app',
        advancedMode: true,
        aiEnabled: true,
        width: 800,
        height: 720,
      }),
    ).toBe('workshop');
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
