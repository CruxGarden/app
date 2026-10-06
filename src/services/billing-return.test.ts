import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { handleBillingReturn, onBillingReturn } from './billing-return';

vi.mock('@/lib/usage-events', () => ({ notifyUsageChanged: vi.fn() }));
const offs: (() => void)[] = [];
afterEach(() => {
  for (const off of offs.splice(0)) off();
});

describe('billing return links', () => {
  it('lets a mounted Plan section claim the return and verify it itself', async () => {
    useAuthStore.setState({ isAuthenticated: true, account: { id: 'a' } as never });
    const claimed = vi.fn(() => true);
    offs.push(onBillingReturn(claimed));
    const sync = vi.fn(async () => ({}));
    expect(await handleBillingReturn({ status: 'success', sessionId: 'cs_1' }, sync)).toBe(
      'claimed',
    );
    expect(claimed).toHaveBeenCalledWith({ status: 'success', sessionId: 'cs_1' });
    expect(sync).not.toHaveBeenCalled();
  });
  it('syncs the plan when nothing claims it, and never for a signed-out app', async () => {
    useAuthStore.setState({ isAuthenticated: true, account: { id: 'a' } as never });
    offs.push(onBillingReturn(() => false));
    const sync = vi.fn(async () => ({}));
    expect(await handleBillingReturn({ status: 'cancel' }, sync)).toBe('synced');
    expect(sync).toHaveBeenCalledTimes(1);
    sync.mockRejectedValueOnce(new Error('offline'));
    expect(await handleBillingReturn({ status: 'success' }, sync)).toBe('failed');
    useAuthStore.setState({ isAuthenticated: false, account: null });
    expect(await handleBillingReturn({ status: 'success' }, sync)).toBe('signed-out');
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
