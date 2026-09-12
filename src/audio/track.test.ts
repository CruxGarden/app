import { afterEach, expect, it, vi } from 'vitest';
import { TrackPlayer } from './track';

afterEach(() => vi.unstubAllGlobals());

it('treats interruption by a replacement track as cancellation, while playing the new track', async () => {
  let rejectPending: ((error: Error) => void) | undefined;
  const element = {
    paused: true,
    ended: false,
    set src(_value: string) {
      rejectPending?.(
        new DOMException('The play() request was interrupted by a new load request.', 'AbortError'),
      );
      rejectPending = undefined;
    },
    play: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectPending = reject;
          }),
      )
      .mockResolvedValue(undefined),
  };
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return element;
      }
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  const player = new TrackPlayer();
  await player.load('first.ogg');
  const pending = player.play();
  const completed = expect(pending).resolves.toBeUndefined();
  await player.load('second.ogg');
  await player.play();
  await completed;
  expect(element.play).toHaveBeenCalledTimes(2);
});

it('still reports an audio failure when the selected track has not changed', async () => {
  vi.stubGlobal(
    'Audio',
    class {
      paused = true;
      play = () => Promise.reject(new DOMException('Cannot start', 'AbortError'));
    },
  );
  const player = new TrackPlayer();
  await player.load('first.ogg');
  await expect(player.play()).rejects.toThrow('Cannot start');
});
