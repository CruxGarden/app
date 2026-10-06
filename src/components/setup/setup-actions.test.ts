import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  apply: vi.fn(),
  restore: vi.fn(),
  snapshot: { values: [['cruxgarden:wornMoodId', 'plasma']], edited: false },
}));
vi.mock('@/lib/moods/packages', () => ({ applyMood: mock.apply, getInstalledMoods: () => [] }));
vi.mock('@/lib/moods/bundled-moods', () => ({
  bundledMood: (id: string) => ({ id, name: id, sound: { cues: {} } }),
}));
vi.mock('@/services/garden-mood', () => ({
  captureLook: () => mock.snapshot,
  restoreLook: mock.restore,
}));
import { abandonSetup, previewMood, setupStartFor } from './setup-actions';
import { useGardenContext } from '@/stores/gardenContext';
import { useSetupWizard } from './setup-store';

beforeEach(() => {
  vi.clearAllMocks();
  useSetupWizard.getState().reset();
});

it('cancelling Run setup again puts back the look from before the first preview', async () => {
  useSetupWizard.getState().begin({ mode: 'again', aiAtStart: 'true', moodAtStart: 'plasma' });
  useSetupWizard.getState().set({ moodId: 'parchment', step: 'mood' });
  await previewMood('parchment');
  await previewMood('night-city');
  expect(mock.apply).toHaveBeenCalledTimes(2);
  expect(mock.apply.mock.calls[0]![1]).toEqual({ sound: false });
  await abandonSetup();
  // One restore, to the snapshot taken before the first preview, never another wear.
  expect(mock.restore).toHaveBeenCalledTimes(1);
  expect(mock.restore.mock.calls[0]![0]).toBe(mock.snapshot);
  expect(mock.apply).toHaveBeenCalledTimes(2);
  expect(useSetupWizard.getState().active).toBe(false);
  // Nothing previewed since: a second cancel has nothing to restore.
  await abandonSetup();
  expect(mock.restore).toHaveBeenCalledTimes(1);
});

it('cancelling without a preview changes nothing', async () => {
  useSetupWizard.getState().begin({ mode: 'again', aiAtStart: null, moodAtStart: 'plasma' });
  await abandonSetup();
  expect(mock.restore).not.toHaveBeenCalled();
  expect(mock.apply).not.toHaveBeenCalled();
});

it('rerunning setup starts with the selected Garden name, not the root name', () => {
  const previous = useGardenContext.getState();
  try {
    useGardenContext.setState({
      root: { id: 'root', slug: 'home', title: 'My Garden' },
      garden: { id: 'studio', slug: 'studio', title: 'Music studio' },
    });
    expect(setupStartFor('again').gardenName).toBe('Music studio');
    expect(setupStartFor('first').gardenName).toBe('My Garden');
  } finally {
    useGardenContext.setState(previous);
  }
});
