import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as billingApi from '@/api/billing';
import { formatBytes } from '@/lib/format';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/cn';

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
    document.title = `Plans — ${APP_NAME}`;
    billingApi
      .plans()
      .then(setCatalog)
      .catch(() => setError(true));
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="relative z-20 flex items-center h-8 px-3 border-b border-border bg-surface-solid shrink-0">
        <div className="flex items-center gap-1.5 text-2xs font-mono">
          <Link to="/" className="shrink-0 text-text-muted hover:underline">
            {APP_NAME}
          </Link>
          <span className="text-text-muted/40">/</span>
          <span className="text-text">Plans</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 rounded-[var(--radius)] bg-bg/70 backdrop-blur-md mt-6 mb-12 border border-border/60">
        <h1 className="font-display text-3xl text-text">Plans</h1>
        <p className="text-sm text-text-muted mt-2 max-w-2xl">
          Everything creative in Crux Garden is free: the app, the AI (on your own key), Moods,
          versions, custom domains. Plans only buy more room for what you publish and back up.
          Nothing is ever cut off for going over; new publishes pause at twice a plan, and you hear
          from us long before that.
        </p>

        {error && <p className="text-sm text-text-muted mt-8">Plans are unavailable right now.</p>}

        {catalog && (
          <>
            <div className="flex items-center justify-end gap-1 text-xxs font-mono text-text-muted mt-8 mb-2">
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
            <div className="grid gap-3 sm:grid-cols-3">
              {catalog.plans.map(({ plan, prices }) => {
                const price = prices.find((p) => p.interval === interval) ?? prices[0];
                return (
                  <div
                    key={plan.id}
                    className="rounded-[var(--radius)] border border-border bg-panel p-4 flex flex-col gap-2"
                    data-testid={`plans-${plan.id}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-display text-lg text-text">{plan.name}</h2>
                      <div className="text-sm font-mono text-text-muted">
                        {price
                          ? `${billingApi.formatPrice(price.amount, price.currency)}/${price.interval === 'year' ? 'yr' : 'mo'}`
                          : 'Free'}
                      </div>
                    </div>
                    {plan.blurb && <p className="text-xs text-text-muted">{plan.blurb}</p>}
                    <ul className="text-xs text-text-muted mt-1 flex flex-col gap-0.5">
                      <li>{formatBytes(plan.storageBytes)} published + backed up</li>
                      <li>{formatBytes(plan.bandwidthBytesPerPeriod)} of visits a month</li>
                      <li>
                        {plan.storeRequestsPerPeriod.toLocaleString()} Crux Store requests a month
                      </li>
                      <li>Custom domains included</li>
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-text-muted mt-6">
              Pick a plan inside the app: Settings → Plan. Checkout is Stripe's, with Apple Pay,
              Google Pay and Link
              {catalog.trialDays > 0 ? `, and trials need no card` : ''}.{' '}
              <a href="/#download" className="text-accent hover:underline">
                Download the app
              </a>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
}
