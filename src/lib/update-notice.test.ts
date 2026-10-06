import { beforeEach, describe, expect, it } from 'vitest';
import type { UpdateState } from './platform';
import {
  dismissUpdateNotice,
  dismissedUpdateNotices,
  resetUpdateNoticeDismissals,
  updateNotice,
} from './update-notice';

const state = (patch: Partial<UpdateState>): UpdateState => ({
  status: 'idle',
  currentVersion: '1.0.0',
  availableVersion: null,
  progress: null,
  error: null,
  failedAction: null,
  autoCheck: true,
  lastCheckedAt: null,
  ...patch,
});

describe('the update notice in the top bar', () => {
  beforeEach(() => resetUpdateNoticeDismissals());

  it('shows nothing unless the updater says there is an update', () => {
    expect(updateNotice(null, [])).toBeNull();
    for (const status of [
      'disabled',
      'idle',
      'checking',
      'not-available',
      'downloading',
      'error',
    ] as const)
      expect(updateNotice(state({ status, availableVersion: '1.1.0' }), []), status).toBeNull();
    // A state without a version names nothing to offer.
    expect(updateNotice(state({ status: 'downloaded' }), [])).toBeNull();
  });

  it('offers a downloaded update as ready, and an available one more quietly', () => {
    expect(updateNotice(state({ status: 'downloaded', availableVersion: '1.1.0' }), [])).toEqual({
      kind: 'ready',
      version: '1.1.0',
      key: 'ready:1.1.0',
    });
    expect(updateNotice(state({ status: 'available', availableVersion: '1.1.0' }), [])).toEqual({
      kind: 'available',
      version: '1.1.0',
      key: 'available:1.1.0',
    });
  });

  it('respects the launch-check switch: off, only an update the person downloaded is shown', () => {
    const off = { autoCheck: false, availableVersion: '1.1.0' };
    expect(updateNotice(state({ ...off, status: 'available' }), [])).toBeNull();
    expect(updateNotice(state({ ...off, status: 'downloaded' }), [])?.kind).toBe('ready');
  });

  it('"Later" puts a notice away once per version for the session', () => {
    const available = state({ status: 'available', availableVersion: '1.1.0' });
    const notice = updateNotice(available, dismissedUpdateNotices())!;
    const dismissed = dismissUpdateNotice(notice.key);
    expect(updateNotice(available, dismissed)).toBeNull();
    // Still away when asked again later in the session (another mount of the bar).
    expect(updateNotice(available, dismissedUpdateNotices())).toBeNull();
    expect(dismissUpdateNotice(notice.key)).toEqual(['available:1.1.0']);
    // Downloading it is a new thing to say; so is a newer version.
    const ready = state({ status: 'downloaded', availableVersion: '1.1.0' });
    expect(updateNotice(ready, dismissedUpdateNotices())?.key).toBe('ready:1.1.0');
    expect(
      updateNotice(state({ status: 'available', availableVersion: '1.2.0' }), dismissed)?.key,
    ).toBe('available:1.2.0');
    dismissUpdateNotice('ready:1.1.0');
    expect(updateNotice(ready, new Set(dismissedUpdateNotices()))).toBeNull();
  });

  it('a new session starts with nothing put away', () => {
    dismissUpdateNotice('ready:1.1.0');
    resetUpdateNoticeDismissals();
    expect(dismissedUpdateNotices()).toEqual([]);
  });
});
