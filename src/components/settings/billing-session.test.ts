import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingSettingsSession,
  FOCUS_RECHECK_MS,
  type BillingSettingsState,
} from './billing-session';
import type { BillingMe, Catalog } from '@/api/billing';

const free: BillingMe = {
  plan: { id: 'free', name: 'Free' } as BillingMe['plan'],
  status: 'none',
  interval: null,
  renewsAt: null,
  trialEndsAt: null,
  graceEndsAt: null,
  pendingCheckout: false,
  cancelAtPeriodEnd: false,
  canManage: false,
  provider: 'stripe',
};
const paid: BillingMe = {
  ...free,
  plan: { id: 'gardener', name: 'Gardener' } as BillingMe['plan'],
  status: 'active',
  interval: 'month',
  canManage: true,
};
const catalog: Catalog = {
  provider: 'stripe',
  instant: false,
  trialDays: 0,
  plans: [
    {
      plan: paid.plan,
      prices: [{ priceId: 'monthly', interval: 'month', amount: 500, currency: 'usd' }],
    },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const clock = { now: 0 };
function fixture(initial = free) {
  const api = {
    me: vi.fn(async () => initial),
    plans: vi.fn(async () => catalog),
    sync: vi.fn(async () => initial),
    checkout: vi.fn(async () => ({ url: 'https://checkout.stripe.com/test' })),
    portal: vi.fn(async () => ({ url: 'https://billing.stripe.com/test' })),
    simulate: vi.fn(async () => paid),
    resumeCheckout: vi.fn(async () => ({ url: 'https://checkout.stripe.com/existing' })),
    cancelCheckout: vi.fn(async () => free),
  };
  let current = true;
  let state: BillingSettingsState;
  const changed = vi.fn((value: BillingSettingsState) => {
    state = value;
  });
  const open = vi.fn(async () => true),
    usageChanged = vi.fn();
  const session = new BillingSettingsSession(
    { api, open, usageChanged, isCurrent: () => current, now: () => clock.now },
    changed,
  );
  return {
    api,
    open,
    usageChanged,
    session,
    changed,
    get state() {
      return state;
    },
    switchAccount: () => {
      current = false;
    },
  };
}

describe('account-owned billing settings', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ignores an old account response and never opens its late checkout URL', async () => {
    const f = fixture();
    await f.session.load();
    const checkout = deferred<{ url: string }>();
    f.api.checkout.mockReturnValueOnce(checkout.promise);
    const choosing = f.session.choose('gardener', 'month');
    f.switchAccount();
    f.session.dispose();
    const calls = f.changed.mock.calls.length;
    checkout.resolve({ url: 'https://checkout.stripe.com/old-account' });
    await choosing;
    expect(f.open).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a disposed initial load and a stale refresh superseded by a newer result', async () => {
    const f = fixture();
    const loading = deferred<BillingMe>();
    f.api.me.mockReturnValueOnce(loading.promise);
    const first = f.session.load();
    f.session.dispose();
    loading.resolve(paid);
    await first;
    expect(f.changed).not.toHaveBeenCalled();
    const fresh = fixture();
    await fresh.session.load();
    const old = deferred<BillingMe>();
    fresh.api.sync.mockReturnValueOnce(old.promise);
    const outdated = fresh.session.refresh();
    fresh.api.sync.mockResolvedValueOnce(paid);
    await fresh.session.refresh();
    old.resolve(free);
    await outdated;
    expect(fresh.state.me).toEqual(paid);
  });

  it('stops polling for an interval-only change and invalidates usage on ordinary refresh', async () => {
    const f = fixture(paid);
    await f.session.load();
    await f.session.manage();
    expect(f.state.waiting).toBe(true);
    f.api.sync.mockResolvedValue({ ...paid, interval: 'year' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.state.waiting).toBe(false);
    expect(f.state.me?.interval).toBe('year');
    expect(vi.getTimerCount()).toBe(0);
    expect(f.usageChanged).toHaveBeenCalledTimes(1);
    f.api.sync.mockResolvedValue({ ...paid, cancelAtPeriodEnd: true });
    await f.session.refresh();
    expect(f.usageChanged).toHaveBeenCalledTimes(2);
  });

  it('makes timeout actionable, supports retry, and prevents disposed polling from restarting', async () => {
    const f = fixture();
    await f.session.load();
    await f.session.choose('gardener', 'month');
    await vi.advanceTimersByTimeAsync(320_000);
    expect(f.state.waiting).toBe(false);
    expect(f.state.notice).toContain('No plan change confirmed');
    expect(vi.getTimerCount()).toBe(0);
    f.api.sync.mockRejectedValueOnce(new Error('offline'));
    await f.session.refresh();
    expect(f.state.error).toContain('Check again');
    f.api.sync.mockResolvedValue(paid);
    await f.session.refresh();
    expect(f.state.error).toBeNull();
    await f.session.manage();
    const blocked = deferred<BillingMe>();
    f.api.sync.mockReturnValueOnce(blocked.promise);
    await vi.advanceTimersByTimeAsync(3000);
    f.session.dispose();
    blocked.resolve(paid);
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes without purchasing again and reports a payment completed during cancellation', async () => {
    const f = fixture({ ...free, pendingCheckout: true });
    await f.session.load();
    await f.session.resumeCheckout();
    expect(f.api.checkout).not.toHaveBeenCalled();
    expect(f.open).toHaveBeenCalledWith('https://checkout.stripe.com/existing');
    expect(f.state.waiting).toBe(true);
    f.api.cancelCheckout.mockResolvedValue(paid);
    await f.session.cancelCheckout();
    expect(f.state.me).toEqual(paid);
    expect(f.state.notice).toContain('already completed');
    expect(f.state.waiting).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not open a resumed checkout or apply cancellation after changing accounts', async () => {
    const f = fixture({ ...free, pendingCheckout: true });
    await f.session.load();
    const response = deferred<{ url: string }>();
    f.api.resumeCheckout.mockReturnValueOnce(response.promise);
    const resuming = f.session.resumeCheckout();
    f.switchAccount();
    response.resolve({ url: 'https://checkout.stripe.com/old-account' });
    await resuming;
    expect(f.open).not.toHaveBeenCalled();
    const other = fixture({ ...free, pendingCheckout: true });
    await other.session.load();
    const cancellation = deferred<BillingMe>();
    other.api.cancelCheckout.mockReturnValueOnce(cancellation.promise);
    const canceling = other.session.cancelCheckout();
    other.switchAccount();
    const calls = other.changed.mock.calls.length;
    cancellation.resolve(paid);
    await canceling;
    expect(other.changed).toHaveBeenCalledTimes(calls);
  });

  it('refuses an unavailable interval and concurrent duplicate checkout requests', async () => {
    const f = fixture();
    await f.session.load();
    await f.session.choose('gardener', 'year');
    expect(f.api.checkout).not.toHaveBeenCalled();
    const blocked = deferred<{ url: string }>();
    f.api.checkout.mockReturnValueOnce(blocked.promise);
    const choosing = f.session.choose('gardener', 'month');
    await f.session.choose('gardener', 'month');
    expect(f.api.checkout).toHaveBeenCalledTimes(1);
    blocked.resolve({ url: 'https://checkout.stripe.com/test' });
    await choosing;
    f.session.dispose();
  });

  it('re-checks quietly on focus only for a pending checkout or a status older than five minutes', async () => {
    clock.now = 1_000_000;
    const f = fixture(paid);
    await f.session.load();
    f.api.sync.mockClear();
    await f.session.focus();
    expect(f.api.sync).not.toHaveBeenCalled();
    clock.now += FOCUS_RECHECK_MS;
    await f.session.focus();
    expect(f.api.sync).toHaveBeenCalledTimes(1);
    expect(f.state.notice).toBeNull();
    const pending = fixture({ ...free, pendingCheckout: true });
    await pending.session.load();
    await pending.session.focus();
    expect(pending.api.sync).toHaveBeenCalledTimes(1);
    expect(pending.state.notice).toBeNull();
    f.session.dispose();
    pending.session.dispose();
  });

  it('keeps the server’s 409 reason and shows the subscription that caused it', async () => {
    const f = fixture();
    await f.session.load();
    const attention = {
      kind: 'unpaid' as const,
      message: 'Your last payment failed.',
      action: 'portal' as const,
    };
    f.api.checkout.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: 'Fix the unpaid invoice in Manage billing first.' },
      },
    });
    f.api.sync.mockResolvedValueOnce({ ...free, status: 'unpaid', canManage: true, attention });
    await f.session.choose('gardener', 'month');
    expect(f.state.error).toBe('Fix the unpaid invoice in Manage billing first.');
    expect(f.state.me?.attention).toEqual(attention);
    expect(f.open).not.toHaveBeenCalled();
    expect(f.state.busy).toBeNull();
  });

  it('verifies at once on a billing return link and says a closed checkout changed nothing', async () => {
    const f = fixture();
    await f.session.load();
    await f.session.choose('gardener', 'month');
    expect(f.state.waiting).toBe(true);
    await f.session.returned('cancel');
    expect(f.api.sync).toHaveBeenCalled();
    expect(f.state.waiting).toBe(false);
    expect(f.state.notice).toContain('Checkout closed');
    expect(vi.getTimerCount()).toBe(0);
    const paidReturn = fixture();
    await paidReturn.session.load();
    await paidReturn.session.choose('gardener', 'month');
    paidReturn.api.sync.mockResolvedValue(paid);
    await paidReturn.session.returned('success');
    expect(paidReturn.state.me).toEqual(paid);
    expect(paidReturn.state.waiting).toBe(false);
    expect(paidReturn.usageChanged).toHaveBeenCalled();
  });
});
