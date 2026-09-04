import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Panel, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import * as billingApi from '@/api/billing';
import { openWeb } from '@/services/desktop';
import { notifyUsageChanged } from '@/lib/usage-events';

/**
 * Settings → Plan: what you're on, what you could be on, one click to Stripe's
 * hosted checkout (Apple Pay / Google Pay / Link — no card typing for most),
 * and the Customer Portal for everything after. The app never sees a card.
 */
export default function PlanSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [me, setMe] = useState<billingApi.BillingMe | null>(null);
  const [catalog, setCatalog] = useState<billingApi.Catalog | null>(null);
  const [interval, setInterval_] = useState<billingApi.BillingInterval>('month');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([billingApi.me(), billingApi.plans()]);
      setMe(m);
      setCatalog(c);
    } catch {
      setError('Plans are unavailable right now');
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  // After sending someone to checkout, keep asking the API until the plan changes
  // (webhook + our re-sync), for a few minutes. Also re-sync when the window refocuses.
  const startWaiting = useCallback((fromPlan: string) => {
    setWaiting(true);
    const started = Date.now();
    const tick = async () => {
      try {
        const m = await billingApi.sync();
        setMe(m);
        if (m.plan.id !== fromPlan) {
          setWaiting(false);
          notifyUsageChanged();
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started < 5 * 60_000) pollRef.current = setTimeout(tick, 4000);
      else setWaiting(false);
    };
    pollRef.current = setTimeout(tick, 3000);
  }, []);
  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );
  useEffect(() => {
    const onFocus = () => {
      if (isAuthenticated)
        billingApi
          .sync()
          .then(setMe)
          .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const choose = async (planId: string) => {
    if (!me) return;
    setBusy(planId);
    setError(null);
    try {
      const { url } = await billingApi.checkout(planId, interval);
      if (catalog?.instant) {
        // mock provider: already paid — just refresh
        setMe(await billingApi.sync());
        notifyUsageChanged();
      } else {
        await openWeb(url);
        startWaiting(me.plan.id);
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not start checkout');
    } finally {
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy('portal');
    setError(null);
    try {
      const { url } = await billingApi.portal();
      await openWeb(url);
      if (me) startWaiting(`${me.plan.id}:${me.status}:${me.cancelAtPeriodEnd}`);
    } catch {
      setError('Could not open billing');
    } finally {
      setBusy(null);
    }
  };

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <Panel data-testid="plan-settings">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-base font-medium text-heading">Plan</h2>
        {me && (
          <span className="text-[11px] font-mono text-text-muted" data-testid="plan-status">
            {me.plan.name}
            {me.status === 'trialing' && me.trialEndsAt
              ? ` · trial ends ${day(me.trialEndsAt)}`
              : ''}
            {me.status === 'active' && me.renewsAt
              ? me.cancelAtPeriodEnd
                ? ` · ends ${day(me.renewsAt)}`
                : ` · renews ${day(me.renewsAt)}`
              : ''}
            {me.status === 'past_due' ? ' · payment failed' : ''}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-error mb-2">{error}</p>}
      {waiting && (
        <p className="text-xs text-text-muted mb-2" data-testid="plan-waiting">
          Finish in your browser — this updates by itself.
        </p>
      )}
      {me?.status === 'past_due' && (
        <p className="text-xs text-warning mb-2">
          Your last payment didn't go through. Your plan stays for a week — update the card in
          Manage billing.
        </p>
      )}

      {catalog && me && (
        <>
          <div className="flex items-center justify-end gap-1 text-[11px] font-mono text-text-muted mb-2">
            {(['month', 'year'] as const).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval_(iv)}
                aria-pressed={interval === iv}
                className={cn(
                  'px-2 py-0.5 rounded-[var(--radius-sm)] cursor-pointer',
                  interval === iv ? 'text-text bg-surface' : 'hover:text-text',
                )}
              >
                {iv === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {catalog.plans.map(({ plan, prices }) => {
              const price = prices.find((p) => p.interval === interval) ?? prices[0];
              const current = plan.id === me.plan.id;
              const paid = plan.id !== 'free';
              return (
                <div
                  key={plan.id}
                  data-testid={`plan-card-${plan.id}`}
                  className={cn(
                    'rounded-[var(--radius)] border p-3 flex flex-col gap-1.5',
                    current ? 'border-accent bg-accent/5' : 'border-border bg-surface/40',
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-sm text-text">{plan.name}</div>
                    <div className="text-xs font-mono text-text-muted">
                      {paid && price
                        ? `${billingApi.formatPrice(price.amount, price.currency)}/${price.interval === 'year' ? 'yr' : 'mo'}`
                        : 'Free'}
                    </div>
                  </div>
                  {plan.blurb && <p className="text-[11px] text-text-muted">{plan.blurb}</p>}
                  <ul className="text-[11px] text-text-muted mt-1">
                    <li>{formatBytes(plan.storageBytes)} storage</li>
                    <li>{formatBytes(plan.bandwidthBytesPerPeriod)} bandwidth / month</li>
                    <li>{plan.storeRequestsPerPeriod.toLocaleString()} store requests / month</li>
                  </ul>
                  <div className="mt-auto pt-2">
                    {current ? (
                      <span className="text-[11px] font-mono text-accent">Current plan</span>
                    ) : paid && (!me.canManage || me.plan.id === 'free') ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!!busy || !price}
                        loading={busy === plan.id}
                        onClick={() => void choose(plan.id)}
                      >
                        {catalog.trialDays > 0
                          ? `Start ${catalog.trialDays}-day trial`
                          : `Choose ${plan.name}`}
                      </Button>
                    ) : paid ? (
                      <span className="text-[11px] text-text-muted">Switch in Manage billing</span>
                    ) : (
                      <span className="text-[11px] text-text-muted">Cancel in Manage billing</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <p className="text-[10px] text-text-muted">
              Checkout is Stripe's — Apple Pay, Google Pay and Link work, and no card details ever
              reach Crux Garden.{catalog.trialDays > 0 ? ' Trials need no card.' : ''}
            </p>
            {me.canManage && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!!busy}
                loading={busy === 'portal'}
                onClick={() => void manage()}
              >
                Manage billing
              </Button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
