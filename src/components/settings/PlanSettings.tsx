import BillingHealth from './BillingHealth';
import Invoices from './Invoices';
import { LegalLink } from '@/components/public/LegalLinks';
import { useRef, useState } from 'react';
import { useAccountStanding } from '@/hooks/useAccountStanding';
import { useBillingSettings } from './useBillingSettings';
import SettingsSection from './SettingsSection';
import { useAuthStore } from '@/stores/authStore';
import { Button, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import * as billingApi from '@/api/billing';

/** A different account mounts a fresh UI and request owner. */
export default function PlanSettings() {
  const accountId = useAuthStore((s) => (s.isAuthenticated ? s.account?.id : null));
  return accountId ? <AccountPlanSettings key={accountId} accountId={accountId} /> : null;
}

function AccountPlanSettings({ accountId }: { accountId: string }) {
  const { me, catalog, busy, error, waiting, notice, session } = useBillingSettings(accountId);
  const [interval, setInterval_] = useState<billingApi.BillingInterval>('month');
  const choose = (planId: string) => session.current?.choose(planId, interval);
  const manage = () => session.current?.manage();
  const simulate = (action: billingApi.SimulationAction) => session.current?.simulate(action);
  const cards = useRef<HTMLDivElement>(null);
  const showPlans = () => {
    cards.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    cards.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  };
  const trial = !!catalog && billingApi.offersTrial(catalog, me);
  const tax = billingApi.taxLine(catalog?.taxBehavior);
  const attention = me?.attention ?? null;
  // A scheduled cancellation (cancel_at_period_end or Stripe's cancel_at)
  // arrives as the end date with cancelAtPeriodEnd set.
  const endsAt = me ? billingApi.scheduledEnd(me) : null;
  const standing = useAccountStanding(accountId);

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <SettingsSection
      title="Plan"
      testId="plan-settings"
      aside={
        me && (
          <span className="text-xxs font-mono text-text-muted" data-testid="plan-status">
            {me.plan.name}
            {me.status === 'trialing' && me.trialEndsAt
              ? ` · trial ends ${day(me.trialEndsAt)}`
              : ''}
            {endsAt
              ? ` · ends ${day(endsAt)}`
              : me.status === 'active' && me.renewsAt
                ? ` · renews ${day(me.renewsAt)}`
                : ''}
            {attention
              ? ' · payment needs attention'
              : me.status === 'past_due'
                ? ' · payment failed'
                : ''}
          </span>
        )
      }
    >
      {me?.provider === 'simulation' && (
        <div className="text-xs text-text-muted mb-3" data-testid="billing-simulation">
          <p>Billing simulation — no payments. Prices and subscription changes are examples.</p>
          <p className="mt-1">Status: {me.status.replaceAll('_', ' ')}</p>
          {me.canSimulate && !billingApi.ENDED_STATUSES.includes(me.status) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(
                [
                  ['activate', 'Payment succeeds'],
                  ['payment_failed', 'Payment fails'],
                  ['unpaid', 'Mark unpaid'],
                  ['renew', 'Next renewal'],
                  ['cancel_at_period_end', 'Cancel at period end'],
                  ['cancel', 'Cancel now'],
                ] as const
              ).map(([action, label]) => (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => void simulate(action)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {standing?.suspended && (
        <div
          role="status"
          data-testid="account-suspended"
          className="mb-3 rounded-[var(--radius-sm)] border border-border bg-surface/(--tint-muted) p-3 text-xs text-text"
        >
          This account is suspended, so publishing and plan changes are paused. Your local Garden is
          unaffected.{standing.suspendedReason ? ` ${standing.suspendedReason}` : ''} Contact
          support to resolve it.
        </div>
      )}
      {attention && (
        <div
          role="alert"
          data-testid="plan-attention"
          className="mb-3 rounded-[var(--radius-sm)] border border-warning-border bg-warning-bg p-3 flex flex-col gap-2"
        >
          <p className="text-xs text-text">{attention.message}</p>
          {(() => {
            const action = billingApi.attentionAction(attention);
            if (action.kind === 'portal' && !me?.canManage) return null;
            return (
              <div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!!busy}
                  loading={action.kind === 'portal' && busy === 'portal'}
                  onClick={() => (action.kind === 'portal' ? void manage() : showPlans())}
                >
                  {action.label}
                </Button>
              </div>
            );
          })()}
        </div>
      )}
      {endsAt && !attention && (
        <p className="text-xs text-text-muted mb-2" data-testid="plan-ends">
          Your {me?.plan.name} plan is set to end on {day(endsAt)}. It stays active until then;
          published work stays online within Free limits afterwards.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error mb-2">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-text-muted mb-2">
          {notice}
        </p>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={!!busy}
        onClick={() => void session.current?.refresh()}
      >
        Check again
      </Button>
      {waiting && (
        <p className="text-xs text-text-muted mb-2" data-testid="plan-waiting" role="status">
          Finish in your browser — this updates by itself.
        </p>
      )}
      {me?.pendingCheckout && (
        <div className="text-xs text-text-muted space-y-2 my-2" data-testid="pending-checkout">
          <p>A checkout is pending. Resume it or cancel it before choosing another plan.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              loading={busy === 'checkout-resume'}
              onClick={() => void session.current?.resumeCheckout()}
            >
              Resume checkout
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              loading={busy === 'checkout-cancel'}
              onClick={() => void session.current?.cancelCheckout()}
            >
              Cancel pending checkout
            </Button>
          </div>
        </div>
      )}
      {me?.status === 'past_due' && !attention && (
        <p className="text-xs text-warning mb-2">
          {me.plan.id !== 'free' && me.graceEndsAt
            ? `Payment needs attention. Paid benefits remain until ${new Date(me.graceEndsAt).toLocaleString()}.`
            : 'Payment needs attention. Paid benefits are paused.'}{' '}
          {me.provider === 'simulation'
            ? 'Use the simulation controls to recover payment.'
            : 'Open Manage billing to update your payment method.'}
        </p>
      )}

      {catalog && me && (
        <>
          <div className="flex justify-end mb-2">
            <SegmentedControl
              label="Billing interval"
              size="xs"
              value={interval}
              onChange={setInterval_}
              options={[
                { value: 'month', label: 'Monthly' },
                { value: 'year', label: 'Yearly' },
              ]}
            />
          </div>
          <div ref={cards} className="grid gap-2 @min-[560px]/settings:grid-cols-3">
            {catalog.plans.map((entry) => {
              const { plan, prices } = entry;
              const price = prices.find((p) => p.interval === interval);
              const current = plan.id === me.plan.id;
              const paid = plan.id !== 'free';
              return (
                <div
                  key={plan.id}
                  data-testid={`plan-card-${plan.id}`}
                  className={cn(
                    'rounded-[var(--radius)] border p-3 flex flex-col gap-1.5',
                    current
                      ? 'border-accent bg-accent/(--tint-trace)'
                      : 'border-border bg-surface/(--tint-muted)',
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-sm text-text">{plan.name}</div>
                    <div className="text-xs font-mono text-text-muted">
                      {billingApi.formatPlanPrice({ plan, prices }, interval)}
                    </div>
                  </div>
                  {plan.blurb && <p className="text-xxs text-text-muted">{plan.blurb}</p>}
                  <ul className="text-xxs text-text-muted mt-1">
                    {billingApi.allowanceLines(entry)?.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    <li>{formatBytes(plan.storageBytes)} storage</li>
                    <li>{formatBytes(plan.bandwidthBytesPerPeriod)} bandwidth / month</li>
                    <li>{plan.storeRequestsPerPeriod.toLocaleString()} store requests / month</li>
                    {plan.customDomains > 0 && (
                      <li>Your own domains — up to {plan.customDomains}</li>
                    )}
                  </ul>
                  <div className="mt-auto pt-2">
                    {current ? (
                      <span className="text-xxs font-mono text-accent">Current plan</span>
                    ) : paid &&
                      (me.provider === 'simulation'
                        ? me.canSimulate || billingApi.ENDED_STATUSES.includes(me.status)
                        : !me.canManage || billingApi.ENDED_STATUSES.includes(me.status)) ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!!busy || waiting || me.pendingCheckout || !price}
                        loading={busy === plan.id}
                        onClick={() => void choose(plan.id)}
                      >
                        {trial ? `Start ${catalog.trialDays}-day trial` : `Choose ${plan.name}`}
                      </Button>
                    ) : paid ? (
                      <span className="text-xxs text-text-muted">
                        {me.provider === 'simulation'
                          ? 'Ask the operator to change the simulation'
                          : 'Switch in Manage billing'}
                      </span>
                    ) : (
                      <span className="text-xxs text-text-muted">
                        {me.provider === 'simulation'
                          ? 'Use the simulation controls to cancel'
                          : 'Cancel in Manage billing'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <p className="text-xxs text-text-muted">
              {me.provider === 'simulation' ? (
                'Changes stay in this API’s database. No payment service or billing emails are used.'
              ) : (
                <>
                  {tax ? `${tax} ` : ''}Checkout is Stripe's — Apple Pay, Google Pay and Link work,
                  and no card details ever reach Crux Garden.
                  {trial ? ' Trials need no card.' : ''} Plans renew until cancelled; cancel anytime
                  in Manage billing and your plan runs to the end of the paid period. By subscribing
                  you agree to the <LegalLink to="/terms">Terms</LegalLink> and{' '}
                  <LegalLink to="/privacy">Privacy</LegalLink> pages.
                </>
              )}
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
      {me && <Invoices accountId={accountId} />}
      {me?.canMonitor && <BillingHealth accountId={accountId} />}
    </SettingsSection>
  );
}
