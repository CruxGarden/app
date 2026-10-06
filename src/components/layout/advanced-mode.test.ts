import { describe, expect, it } from 'vitest';
import { offeredPanes } from './panel-order';

describe('installation modes are independent', () => {
  it.each([false, true])(
    'keeps everyday tools with AI=%s while controlling raw data discovery',
    (ai) => {
      const simple = offeredPanes('crux', 'c1', ai, false);
      const advanced = offeredPanes('crux', 'c1', ai, true);
      for (const pane of ['workshop', 'artifacts', 'history', 'publish', 'export', 'settings']) {
        expect(simple).toContain(pane);
        expect(advanced).toContain(pane);
      }
      expect(simple).not.toContain('store');
      expect(advanced).toContain('store');
      expect(simple.includes('collaboration')).toBe(ai);
      expect(advanced.includes('collaboration')).toBe(ai);
    },
  );
});
