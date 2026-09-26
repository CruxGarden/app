import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  db: {
    gardenMood: { read: vi.fn(), resolve: vi.fn(), select: vi.fn() },
    onChange: vi.fn(),
  },
  settings: new Map<string, string>(),
  settingListeners: new Set<(key: string) => void>(),
  apply: vi.fn(),
  read: vi.fn(),
  backing: vi.fn(),
}));
vi.mock('./sqlite/client', () => ({ getSqliteClient: () => mock.db }));
vi.mock('@/services/settings', () => ({
  getSetting: (key: string) => mock.settings.get(key) ?? null,
  setSetting: (key: string, value: string) => {
    mock.settings.set(key, value);
    mock.settingListeners.forEach((fn) => fn(key));
  },
  onSettingChange: (fn: (key: string) => void) => {
    mock.settingListeners.add(fn);
    return () => mock.settingListeners.delete(fn);
  },
}));
vi.mock('@/lib/moods/packages', () => ({ applyMood: mock.apply }));
vi.mock('@/lib/moods/bundled-moods', () => ({
  bundledMood: (id: string) =>
    ['plasma', 'concrete-sky'].includes(id) ? { id, name: `Built-in ${id}` } : undefined,
}));
vi.mock('./mood-library', () => ({ readMoodCrux: mock.read, builtInMoodCrux: mock.backing }));
import { useGardenContext } from '@/stores/gardenContext';
import { SettingsKey } from '@/lib/constants';
import { setSetting } from '@/services/settings';
import {
  lookEdited,
  projectActiveGarden,
  readGardenMood,
  setGardenMoodMode,
  wearInGarden,
} from './garden-mood';
import type { MoodPackage } from '@/lib/moods/packages';

const selection = (mode: string, moodId: string | null = null) => ({
  mode,
  moodId,
  edgeId: moodId ? 'edge' : null,
});
const own = (moodId: string, source = 'root') => ({
  gardenId: 'x',
  mode: 'own',
  moodId,
  sourceGardenId: source,
  sourceTitle: 'My Garden',
});
const none = {
  gardenId: 'x',
  mode: 'default',
  moodId: null,
  sourceGardenId: null,
  sourceTitle: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mock.settings.clear();
  useGardenContext.getState().initialize({ id: 'root', slug: 'root', title: 'My Garden' });
  mock.db.gardenMood.read.mockResolvedValue({ gardenId: 'root', selection: selection('inherit') });
  mock.db.gardenMood.resolve.mockResolvedValue(none);
  mock.read.mockImplementation(async (id: string) => ({
    pkg: { id, name: 'Dusk' },
    portableId: id === 'backing' ? 'concrete-sky' : 'dusk-portable',
    revision: 2,
  }));
});

it('paints the resolved saved Mood once and records the exact content revision', async () => {
  mock.db.gardenMood.resolve.mockResolvedValue(own('dusk'));
  await projectActiveGarden();
  await projectActiveGarden();
  expect(mock.apply).toHaveBeenCalledTimes(1);
  expect(mock.apply.mock.calls[0]![0]).toMatchObject({ id: 'dusk', name: 'Dusk' });
  expect(mock.settings.get(SettingsKey.MoodProjection)).toBe('dusk:2');
});

it('wears a chosen built-in Mood as it ships, not its stored reference', async () => {
  mock.db.gardenMood.resolve.mockResolvedValue(own('backing'));
  mock.settings.set(SettingsKey.MoodProjection, 'plasma');
  await projectActiveGarden();
  expect(mock.apply.mock.calls[0]![0]).toMatchObject({ id: 'concrete-sky' });
  expect(mock.settings.get(SettingsKey.MoodProjection)).toBe('concrete-sky');
});

it('records a fresh garden already wearing the Default Mood without repainting it', async () => {
  mock.settings.set(SettingsKey.WornMoodId, 'plasma');
  await projectActiveGarden();
  expect(mock.apply).not.toHaveBeenCalled();
  expect(mock.settings.get(SettingsKey.MoodProjection)).toBe('plasma');
});

it('never paints a Garden that stopped being active while its choice was read', async () => {
  mock.settings.set(SettingsKey.MoodProjection, 'plasma');
  let release!: (value: unknown) => void;
  mock.db.gardenMood.resolve.mockReturnValueOnce(new Promise((r) => (release = r)));
  const first = projectActiveGarden();
  await Promise.resolve();
  useGardenContext.getState().select({ id: 'studio', slug: 'studio' });
  mock.db.gardenMood.resolve.mockResolvedValue(own('dusk', 'studio'));
  release(own('backing'));
  await first;
  await projectActiveGarden();
  expect(mock.apply).toHaveBeenCalledTimes(1);
  expect(mock.apply.mock.calls[0]![0]).toMatchObject({ id: 'dusk' });
});

it('chooses a built-in Mood through one backing Crux and the inspected selection', async () => {
  mock.settings.set(SettingsKey.MoodProjection, 'plasma');
  mock.backing.mockResolvedValue('backing');
  mock.db.gardenMood.resolve.mockResolvedValue(own('backing'));
  await wearInGarden({ id: 'concrete-sky', name: 'Concrete Sky' } as MoodPackage);
  expect(mock.backing).toHaveBeenCalledTimes(1);
  expect(mock.db.gardenMood.select).toHaveBeenCalledWith({
    gardenId: 'root',
    mode: 'own',
    moodId: 'backing',
    expected: selection('inherit'),
  });
  expect(mock.apply.mock.calls[0]![0]).toMatchObject({ id: 'concrete-sky' });
});

it('returns to the parent or the Default Mood without naming a Mood', async () => {
  mock.settings.set(SettingsKey.MoodProjection, 'plasma');
  useGardenContext.getState().select({ id: 'studio', slug: 'studio' });
  await setGardenMoodMode('none');
  expect(mock.db.gardenMood.select).toHaveBeenCalledWith(
    expect.objectContaining({ gardenId: 'studio', mode: 'none', moodId: null }),
  );
  await setGardenMoodMode('inherit');
  expect(mock.db.gardenMood.select).toHaveBeenLastCalledWith(
    expect.objectContaining({ gardenId: 'studio', mode: 'inherit', moodId: null }),
  );
});

it('keeps the look a device already wore by making it the root Garden’s choice once', async () => {
  mock.settings.set(SettingsKey.WornMoodId, 'concrete-sky');
  mock.backing.mockResolvedValue('backing');
  mock.db.gardenMood.select.mockImplementation(async () => {
    mock.db.gardenMood.resolve.mockResolvedValue(own('backing'));
  });
  await projectActiveGarden();
  expect(mock.db.gardenMood.select).toHaveBeenCalledWith(
    expect.objectContaining({ gardenId: 'root', mode: 'own', moodId: 'backing' }),
  );
  expect(mock.apply).not.toHaveBeenCalled();
  await projectActiveGarden();
  expect(mock.db.gardenMood.select).toHaveBeenCalledTimes(1);
});

it('describes where the look comes from', async () => {
  mock.db.gardenMood.resolve.mockResolvedValue(own('dusk'));
  useGardenContext.getState().select({ id: 'studio', slug: 'studio' });
  expect(await readGardenMood()).toMatchObject({
    gardenId: 'studio',
    mode: 'inherit',
    source: { mode: 'own', gardenId: 'root', title: 'My Garden' },
    wornId: 'dusk',
    name: 'Dusk',
    isRoot: false,
  });
});

it('a change to the look here is an edit; painting the Garden’s Mood is not', async () => {
  mock.db.gardenMood.resolve.mockResolvedValue(own('dusk-id'));
  mock.apply.mockImplementation(async () =>
    setSetting(SettingsKey.MoodThemeDark, '{"accent":"#123"}'),
  );
  await projectActiveGarden();
  expect(mock.apply).toHaveBeenCalled();
  expect(lookEdited()).toBe(false);
  setSetting(SettingsKey.MoodThemeDark, '{"accent":"#456"}');
  expect(lookEdited()).toBe(true);
  // Unrelated settings do not count.
  mock.db.gardenMood.resolve.mockResolvedValue(own('other-id'));
  useGardenContext.getState().select({ id: 'studio', slug: 'studio', title: 'Studio' });
  await projectActiveGarden();
  expect(lookEdited()).toBe(false);
});
