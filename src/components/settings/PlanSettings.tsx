import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Panel, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import * as billingApi from '@/api/billing';
import { openWeb } from '@/services/desktop';
import { isBillingUrl } from '@/api/billing';
import { notifyUsageChanged } from '@/lib/usage-events';

/** The bit of billing state a checkout or portal visit can change. */
function keyOf(m: billingApi.BillingMe): string {
  return `${m.plan.id}:${m.status}:${m.cancelAtPeriodEnd}`;
}

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
  // The billing state we're waiting to move away from; null when not waiting.
  const waitingFromRef = useRef<string | null>(null);

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

  const stopWaiting = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
    waitingFromRef.current = null;
    setWaiting(false);
  }, []);

  // Take a fresh BillingMe: show it, and if we were waiting for a change and
  // this is one, stop. Used by the poll and by the window-focus re-sync alike.
  const absorb = useCallback(
    (m: billingApi.BillingMe) => {
      setMe(m);
      if (waitingFromRef.current !== null && keyOf(m) !== waitingFromRef.current) {
        stopWaiting();
        notifyUsageChanged();
      }
    },
    [stopWaiting],
  );

  // After sending someone to checkout or the portal, keep asking the API until
  // the billing state changes (webhook + our re-sync), for a few minutes —
  // backing off from 4s to 15s. Refocusing the window re-syncs immediately, so
  // the common path (finish in browser, come back) never waits on the timer.
  // Starting again replaces any chain in flight; only one ever runs.
  const startWaiting = useCallback(
    (from: billingApi.BillingMe) => {
      if (pollRef.current) clearTimeout(pollRef.current);
      waitingFromRef.current = keyOf(from);
      setWaiting(true);
      const started = Date.now();
      let delay = 4000;
      const tick = async () => {
        pollRef.current = null;
        try {
          absorb(await billingApi.sync());
        } catch {
          /* keep polling */
        }
        if (waitingFromRef.current === null) return; // absorbed a change (or unmounted)
        if (Date.now() - started >= 5 * 60_000) {
          stopWaiting();
          return;
        }
        delay = Math.min(15_000, Math.round(delay * 1.5));
        pollRef.current = setTimeout(tick, delay);
      };
      pollRef.current = setTimeout(tick, 3000);
    },
    [absorb, stopWaiting],
  );
  useEffect(() => stopWaiting, [stopWaiting]);
  useEffect(() => {
    const onFocus = () => {
      if (isAuthenticated)
        billingApi
          .sync()
          .then(absorb)
          .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isAuthenticated, absorb]);

  if (!isAuthenticated) return null;

  // Only Stripe's hosted pages (and our own return pages) ever open from here;
  // a false result means the browser never got the URL, so say so.
  const openBilling = async (url: string): Promise<boolean> => {
    if (!isBillingUrl(url)) {
      setError('The billing link looked wrong, so it was not opened');
      return false;
    }
    if (!(await openWeb(url))) {
      setError("Couldn't open your browser — try again");
      return false;
    }
    return true;
  };

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
        if (!(await openBilling(url))) return;
        startWaiting(me);
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
      if (!(await openBilling(url))) return;
      if (me) startWaiting(me);
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
          <span className="text-xxs font-mono text-text-muted" data-testid="plan-status">
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
          <div className="flex items-center justify-end gap-1 text-xxs font-mono text-text-muted mb-2">
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
                  {plan.blurb && <p className="text-xxs text-text-muted">{plan.blurb}</p>}
                  <ul className="text-xxs text-text-muted mt-1">
                    <li>{formatBytes(plan.storageBytes)} storage</li>
                    <li>{formatBytes(plan.bandwidthBytesPerPeriod)} bandwidth / month</li>
                    <li>{plan.storeRequestsPerPeriod.toLocaleString()} store requests / month</li>
                  </ul>
                  <div className="mt-auto pt-2">
                    {current ? (
                      <span className="text-xxs font-mono text-accent">Current plan</span>
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
                      <span className="text-xxs text-text-muted">Switch in Manage billing</span>
                    ) : (
                      <span className="text-xxs text-text-muted">Cancel in Manage billing</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <p className="text-2xs text-text-muted">
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
