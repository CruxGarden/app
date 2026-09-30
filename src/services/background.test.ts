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

it('does not store or apply generation that finishes after a later selection', async () => {
  let finish!: (blob: Blob) => void;
  const generated = new Promise<Blob>((resolve) => {
    finish = resolve;
  });
  const pending = setBackgroundFromBlob(generated);
  await setBackgroundType(BgType.Blank);
  finish(new Blob(['late image']));
  expect(await pending).toBe('');
  expect(fixtures.put).not.toHaveBeenCalled();
  expect(fixtures.settings.get(SettingsKey.BackgroundType)).toBe(BgType.Blank);
});

it('applies the newest generation even when an older one finishes last', async () => {
  let finish!: (blob: Blob) => void;
  const old = setBackgroundFromBlob(
    new Promise<Blob>((resolve) => {
      finish = resolve;
    }),
  );
  fixtures.put.mockResolvedValue('new');
  fixtures.load.mockResolvedValue('blob:new');
  expect(await setBackgroundFromBlob(Promise.resolve(new Blob(['new'])))).toBe('blob:new');
  finish(new Blob(['old']));
  expect(await old).toBe('');
  expect(fixtures.put).toHaveBeenCalledTimes(1);
  expect(useMoodStore.getState().backgroundUrl).toBe('blob:new');
});

it('leaves the displayed image intact when generation fails', async () => {
  await setBackgroundImage('current', 'blob:current');
  await expect(
    setBackgroundFromBlob(Promise.reject(new Error('provider refused'))),
  ).rejects.toThrow('provider refused');
  expect(useMoodStore.getState().backgroundUrl).toBe('blob:current');
  expect(fixtures.settings.get(SettingsKey.BackgroundImage)).toBe('current');
  expect(fixtures.put).not.toHaveBeenCalled();
});
