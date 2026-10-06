import { useEffect, useState } from 'react';
import { linkClass, segmentClass, segmentGroupClass } from '@/components/ui/button-class';
import * as billingApi from '@/api/billing';
import { formatBytes } from '@/lib/format';
import { APP_NAME } from '@/lib/constants';
import PageHeader from '@/components/layout/PageHeader';
import { LegalAgreement, PublicFooter } from '@/components/public/LegalLinks';
import { canonicalUrl, usePageMeta } from '@/hooks/usePageMeta';

/**
 * crux.garden/plans — the one place prices live on the website. The landing
 * page only says what Free includes and links here; picking a plan happens in
 * the app (Settings → Plan), because that is where the account is.
 */
export default function Plans() {
  const [catalog, setCatalog] = useState<billingApi.Catalog | null>(null);
  const [interval, setInterval_] = useState<billingApi.BillingInterval>('month');
  const [error, setError] = useState(false);

  useEffect(() => {
    billingApi
      .plans()
      .then(setCatalog)
      .catch(() => setError(true));
  }, []);
  const trial = !!catalog && billingApi.offersTrial(catalog);
  const tax = billingApi.taxLine(catalog?.taxBehavior);
  usePageMeta({
    title: `Plans — ${APP_NAME}`,
    description:
      'The Crux Garden app, Moods, Growth and basic publishing are free. Paid plans add hosting room, your own domains and included collaboration.',
    canonical: canonicalUrl('/plans'),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Plans" />

      <main className="relative z-10 w-full max-w-4xl mx-auto px-6 sm:px-8 py-10 rounded-[var(--radius)] bg-panel border border-panel-border shadow-panel mt-6 mb-6 text-panel-text">
        <h1 className="font-display text-3xl text-text">Plans</h1>
        <p className="text-sm text-text-muted mt-2 max-w-2xl">
          The app, Moods, Growth and basic publishing are free. Paid plans add hosting room, your
          own domains and included collaboration — a collaborator you can use without bringing a key
          of your own.
        </p>

        {error && <p className="text-sm text-text-muted mt-8">Plans are unavailable right now.</p>}

        {catalog && (
          <>
            <div className="flex items-center justify-end mt-8 mb-2">
              <div role="group" aria-label="Billing interval" className={segmentGroupClass()}>
                {(['month', 'year'] as const).map((iv) => (
                  <button
                    key={iv}
                    type="button"
                    onClick={() => setInterval_(iv)}
                    aria-pressed={interval === iv}
                    className={segmentClass(interval === iv, 'xs', 'font-mono')}
                  >
                    {iv === 'month' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {catalog.plans.map((entry) => {
                const { plan, prices } = entry;
                return (
                  <div
                    key={plan.id}
                    className="rounded-[var(--radius)] border border-border bg-panel p-4 flex flex-col gap-2"
                    data-testid={`plans-${plan.id}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-display text-lg text-text">{plan.name}</h2>
                      <div className="text-sm font-mono text-text-muted">
                        {billingApi.formatPlanPrice({ plan, prices }, interval)}
                      </div>
                    </div>
                    {plan.blurb && <p className="text-xs text-text-muted">{plan.blurb}</p>}
                    {plan.id !== 'free' && trial && (
                      <p className="text-xs font-mono text-accent">
                        Free trial · {catalog.trialDays} days
                      </p>
                    )}
                    <ul className="text-xs text-text-muted mt-1 flex flex-col gap-0.5">
                      {billingApi.allowanceLines(entry)?.map((line) => (
                        <li key={line} className="text-text">
                          {line}
                        </li>
                      ))}
                      {plan.id === 'free' && <li>Collaborate with your own key</li>}
                      <li>{formatBytes(plan.storageBytes)} published + backed up</li>
                      <li>{formatBytes(plan.bandwidthBytesPerPeriod)} of visits a month</li>
                      <li>
                        {plan.storeRequestsPerPeriod.toLocaleString()} Crux Store requests a month
                      </li>
                      {plan.customDomains > 0 && (
                        <li>
                          Your own domains — up to {plan.customDomains}, certificates included
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
            {tax && <p className="text-xs text-text-muted mt-3">{tax}</p>}
            <section aria-label="How plans work" className="mt-6 flex flex-col gap-3 max-w-2xl">
              <div>
                <h2 className="font-display text-base text-text">Your own key</h2>
                <p className="text-xs text-text-muted mt-1">
                  Your own provider key works on every plan, Free included; those requests go
                  straight to your provider and are billed by them. Paid plans add hosting room,
                  your own domains and included collaboration on top.
                </p>
              </div>
              <div>
                <h2 className="font-display text-base text-text">Limits</h2>
                <ul className="text-xs text-text-muted mt-1 flex flex-col gap-0.5">
                  <li>
                    Hosting limits — storage, visits and Crux Store requests — reset on the 1st of
                    each month (UTC).
                  </li>
                  <li>
                    Included collaboration rolls over two windows: the last 5 hours and the last 30
                    days. Allowance returns as earlier requests age out.
                  </li>
                  <li>
                    Near a limit, replies may get shorter, then pause until allowance returns. There
                    are no overage charges.
                  </li>
                  <li>Storage above twice your plan's limit pauses new uploads and publishes.</li>
                </ul>
              </div>
              <div>
                <h2 className="font-display text-base text-text">Renewal and cancelling</h2>
                <ul className="text-xs text-text-muted mt-1 flex flex-col gap-0.5">
                  <li>Plans renew each month or year until you cancel.</li>
                  <li>
                    Cancel anytime; your plan runs to the end of the period you paid for. There are
                    no partial refunds.
                  </li>
                  <li>
                    When a plan ends, published work stays online within Free limits. Custom domains
                    stay connected; connecting a new one needs a plan.
                  </li>
                </ul>
              </div>
            </section>
            <p className="text-xs text-text-muted mt-6">
              Pick a plan inside the app: Settings → Plan. Checkout is Stripe's, with Apple Pay,
              Google Pay and Link
              {trial ? `, and trials need no card` : ''}.{' '}
              <a href="/#download" className={linkClass()}>
                Download the app
              </a>
              .
            </p>
            <LegalAgreement action="subscribing" className="mt-2" />
          </>
        )}
      </main>
      <PublicFooter className="pt-0 pb-10" />
    </div>
  );
}
