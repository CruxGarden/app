import { beforeEach, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  load: vi.fn(),
  put: vi.fn(),
}));
vi.mock('./settings', () => ({
  getSetting: (key: string) => fixtures.settings.get(key),
  setSetting: (key: string, value: string) => fixtures.settings.set(key, value),
}));
vi.mock('./blobs', () => ({ blobObjectUrl: fixtures.load, putBlob: fixtures.put }));
import {
  clearBackgroundImage,
  setBackgroundImage,
  setBackgroundFromBlob,
  setBackgroundType,
} from './background';
import { useMoodStore } from '@/stores/moodStore';
import { SettingsKey } from '@/lib/constants';
import { BgType } from '@/lib/types';

beforeEach(async () => {
  await clearBackgroundImage();
  fixtures.settings.clear();
  fixtures.load.mockReset();
  fixtures.put.mockReset();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

it('releases the previous owned image on replacement and clear', async () => {
  fixtures.load.mockResolvedValueOnce('blob:a').mockResolvedValueOnce('blob:b');
  await setBackgroundImage('a');
  await setBackgroundImage('b');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a');
  await clearBackgroundImage();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b');
  expect(useMoodStore.getState().backgroundUrl).toBeNull();
});

it('keeps the latest selection when older image bytes arrive last', async () => {
  let finish!: (url: string) => void;
  fixtures.load
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce('blob:b');
  const old = setBackgroundImage('a');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await setBackgroundImage('b');
  finish('blob:a');
  await old;
  expect(useMoodStore.getState().backgroundUrl).toBe('blob:b');
  expect(fixtures.settings.get(SettingsKey.BackgroundImage)).toBe('b');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a');
});

it('clear cancels a pending image load', async () => {
  let finish!: (url: string) => void;
  fixtures.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = setBackgroundImage('a');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await clearBackgroundImage();
  finish('blob:a');
  await pending;
  expect(useMoodStore.getState().backgroundUrl).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a');
});

it('does not apply an upload that finishes after another background is selected', async () => {
  let finish!: (fingerprint: string) => void;
  fixtures.put.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = setBackgroundFromBlob(new Blob(['image']));
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await setBackgroundType(BgType.Blank);
  finish('late');
  await pending;
  expect(fixtures.settings.get(SettingsKey.BackgroundType)).toBe(BgType.Blank);
  expect(fixtures.load).not.toHaveBeenCalled();
});

it('never revokes a borrowed bundled URL', async () => {
  await setBackgroundImage('', '/bundled/background.jpg');
  await clearBackgroundImage();
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('/bundled/background.jpg');
});
