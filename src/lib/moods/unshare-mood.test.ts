import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import type { Crux } from '@/api/types';
import { captureCurrentMood, getInstalledMoods, installMood } from './packages';
import { unshareMood } from './unshare-mood';

describe('unshare Mood', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.MoodPackages, '');
  });
  it('keeps published state on failure, then removes only its public status on retry', async () => {
    const pkg = await installMood({
      ...captureCurrentMood({ name: 'Sea Glass' }),
      publishedAt: '2026-10-01',
      publishedCruxId: 'published-mood',
    });
    const unpublish = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    const deps = {
      findCrux: async () => ({ id: 'published-mood', kind: 'mood' }) as Crux,
      unpublish,
    };
    await expect(unshareMood(pkg, deps)).rejects.toThrow('offline');
    expect(getInstalledMoods()[0]?.publishedAt).toBe(pkg.publishedAt);
    const saved = await unshareMood(pkg, deps);
    expect(saved).toEqual({ ...pkg, publishedAt: undefined });
    expect(getInstalledMoods()).toEqual([saved]);
  });
  it('does not unpublish a package whose publishing Crux is absent from this Garden', async () => {
    const pkg = {
      ...captureCurrentMood({ name: 'Downloaded' }),
      publishedAt: 'today',
      publishedCruxId: 'remote',
    };
    const unpublish = vi.fn();
    await expect(unshareMood(pkg, { findCrux: async () => null, unpublish })).rejects.toThrow(
      'Garden that shared',
    );
    expect(unpublish).not.toHaveBeenCalled();
  });
});
