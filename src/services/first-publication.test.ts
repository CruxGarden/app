import { beforeEach, expect, it } from 'vitest';
import { initServices } from './index';
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting, removeSetting, flushSettings } from './settings';
import { claimFirstPublication } from './first-publication';

beforeEach(async () => {
  await initServices();
  removeSetting(SettingsKey.FirstPublication);
  removeSetting(SettingsKey.CelebratePublication);
  await flushSettings();
});
it('acknowledges just one of simultaneous successful publications and remembers it', async () => {
  expect(await Promise.all([claimFirstPublication('one'), claimFirstPublication('two')])).toEqual([
    true,
    false,
  ]);
  expect(getSetting(SettingsKey.FirstPublication)).toBe('one');
  expect(await claimFirstPublication('one')).toBe(false);
});
it('honors opt-out without later calling another publication the first', async () => {
  setSetting(SettingsKey.CelebratePublication, 'false');
  expect(await claimFirstPublication('quiet')).toBe(false);
  setSetting(SettingsKey.CelebratePublication, 'true');
  expect(await claimFirstPublication('later')).toBe(false);
});
