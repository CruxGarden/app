import { beforeEach, expect, it, vi } from 'vitest';
import { includedUsage, type IncludedUsage } from '@/api/inference';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { refreshIncludedAccess, useIncludedAccess } from './included-access';
import { setSetting, removeSetting } from './settings';
import { SettingsKey } from '@/lib/constants';
import { getDefaultModel, automaticModel } from '@/ai/keys';
vi.mock('@/api/inference', () => ({ includedUsage: vi.fn() }));
const usage = { eligible: true, available: true } as IncludedUsage;
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, account: { id: crypto.randomUUID() } as never });
  useUIStore.getState().setAiEnabled(false);
  removeSetting(SettingsKey.AiEnabled);
  removeSetting(SettingsKey.DefaultModel);
  vi.mocked(includedUsage).mockResolvedValue(usage);
});
it('makes a verified subscriber ready without a key or changing an explicit preference', async () => {
  await refreshIncludedAccess();
  expect(useUIStore.getState().aiEnabled).toBe(true);
  expect(await getDefaultModel()).toBe('garden-included');
  setSetting(SettingsKey.AiEnabled, 'false');
  useUIStore.getState().setAiEnabled(false);
  setSetting(SettingsKey.DefaultModel, 'ollama/my-model');
  await refreshIncludedAccess();
  expect(useUIStore.getState().aiEnabled).toBe(false);
  expect(await getDefaultModel()).toBe('ollama/my-model');
});
it('discards delayed entitlement after disconnect and does not show a stale allowance', async () => {
  let finish!: (value: IncludedUsage) => void;
  vi.mocked(includedUsage).mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = refreshIncludedAccess();
  useAuthStore.setState({ isAuthenticated: false, account: null });
  await refreshIncludedAccess();
  finish(usage);
  await pending;
  expect(useIncludedAccess.getState()).toMatchObject({ status: 'signed-out', usage: null });
  expect(useUIStore.getState().aiEnabled).toBe(false);
});
it('does not treat unavailable entitlement as a free account or disable an existing manual choice', async () => {
  await refreshIncludedAccess();
  vi.mocked(includedUsage).mockRejectedValue(new Error('offline'));
  await refreshIncludedAccess();
  expect(useIncludedAccess.getState().status).toBe('unavailable');
  expect(await getDefaultModel()).toBe('garden-included');
});

it('keeps an unknown signed-in account on the included route during an initial outage', async () => {
  vi.mocked(includedUsage).mockRejectedValue(new Error('offline'));
  expect(await getDefaultModel()).toBe('garden-included');
  expect(useIncludedAccess.getState()).toMatchObject({ status: 'unavailable', usage: null });
});

it('does not delay local creation behind an unanswered entitlement request', async () => {
  let finish!: (value: IncludedUsage) => void;
  vi.mocked(includedUsage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  try {
    expect(await getDefaultModel()).toBe('garden-included');
    expect(useIncludedAccess.getState().status).toBe('checking');
  } finally {
    finish(usage);
  }
}, 1000);

it('keeps an included conversation on its route after entitlement or session loss', async () => {
  vi.mocked(includedUsage).mockResolvedValue({ ...usage, eligible: false });
  await refreshIncludedAccess();
  expect(automaticModel('garden-included')).toBe('garden-included');
  useAuthStore.setState({ isAuthenticated: false, account: null });
  await refreshIncludedAccess();
  expect(automaticModel('garden-included')).toBe('garden-included');
});
