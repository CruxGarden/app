import { beforeEach, expect, it } from 'vitest';
import { pinsFor, togglePin } from './pins';
import { removeSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

beforeEach(() => removeSetting(SettingsKey.PanelPins));

it('pins per workspace kind, in the order pinned, and unpins', () => {
  togglePin('crux', 'artifacts');
  togglePin('crux', 'history');
  togglePin('garden', 'settings');
  expect(pinsFor('crux')).toEqual(['artifacts', 'history']);
  expect(pinsFor('garden')).toEqual(['settings']);
  togglePin('crux', 'artifacts');
  expect(pinsFor('crux')).toEqual(['history']);
});
