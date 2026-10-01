import BillingHealth from './BillingHealth';
import { useState } from 'react';
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
            {me.status === 'active' && me.renewsAt
              ? me.cancelAtPeriodEnd
                ? ` · ends ${day(me.renewsAt)}`
                : ` · renews ${day(me.renewsAt)}`
              : ''}
            {me.status === 'past_due' ? ' · payment failed' : ''}
          </span>
        )
      }
    >
      {me?.provider === 'simulation' && (
        <div className="text-xs text-text-muted mb-3" data-testid="billing-simulation">
          <p>Billing simulation — no payments. Prices and subscription changes are examples.</p>
          <p className="mt-1">Status: {me.status.replaceAll('_', ' ')}</p>
          {me.canSimulate && !['none', 'canceled'].includes(me.status) && (
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
      {me?.status === 'past_due' && (
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
          <div className="grid gap-2 @min-[560px]/settings:grid-cols-3">
            {catalog.plans.map(({ plan, prices }) => {
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
                        ? me.canSimulate || ['none', 'canceled'].includes(me.status)
                        : !me.canManage || ['none', 'canceled'].includes(me.status)) ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!!busy || waiting || me.pendingCheckout || !price}
                        loading={busy === plan.id}
                        onClick={() => void choose(plan.id)}
                      >
                        {catalog.trialDays > 0
                          ? `Start ${catalog.trialDays}-day trial`
                          : `Choose ${plan.name}`}
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
                  Checkout is Stripe's — Apple Pay, Google Pay and Link work, and no card details
                  ever reach Crux Garden.{catalog.trialDays > 0 ? ' Trials need no card.' : ''}
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
      {me?.canMonitor && <BillingHealth accountId={accountId} />}
    </SettingsSection>
  );
}
