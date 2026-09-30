import { beforeEach, expect, it, vi } from 'vitest';
import { recentExploreTags, rememberExploreTag, clearExploreTags } from './recent-tags';
const state = vi.hoisted(() => ({ value: '', failWrite: false }));
vi.mock('@/services/settings', () => ({
  getSetting: () => state.value,
  setSetting: (_: string, value: string) => {
    state.value = value;
    if (state.failWrite) throw new Error('Storage unavailable');
  },
}));
beforeEach(() => {
  state.value = '';
  state.failWrite = false;
});
it('remembers eight unique topics, moves reused topics first, and clears history', () => {
  for (let n = 0; n < 10; n++) rememberExploreTag(`topic-${n}`);
  expect(recentExploreTags()).toEqual([
    'topic-9',
    'topic-8',
    'topic-7',
    'topic-6',
    'topic-5',
    'topic-4',
    'topic-3',
    'topic-2',
  ]);
  expect(rememberExploreTag('topic-4')).toEqual([
    'topic-4',
    'topic-9',
    'topic-8',
    'topic-7',
    'topic-6',
    'topic-5',
    'topic-3',
    'topic-2',
  ]);
  clearExploreTags();
  expect(recentExploreTags()).toEqual([]);
});
it('ignores corrupted or invalid saved preferences', () => {
  for (const value of ['invalid', '{}', 'null']) {
    state.value = value;
    if (state.failWrite) throw new Error('Storage unavailable');
    expect(recentExploreTags()).toEqual([]);
  }
  state.value = JSON.stringify(['music', '', null, 3, 'music', 'x'.repeat(81), 'games']);
  expect(recentExploreTags()).toEqual(['music', 'games']);
});

it('keeps optional history failures from interrupting topic selection or clearing', () => {
  state.failWrite = true;
  expect(rememberExploreTag('music')).toEqual(['music']);
  expect(rememberExploreTag('games')).toEqual(['games', 'music']);
  expect(() => clearExploreTags()).not.toThrow();
  expect(recentExploreTags()).toEqual([]);
});
