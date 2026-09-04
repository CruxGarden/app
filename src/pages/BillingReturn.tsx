import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { APP_NAME } from '@/lib/constants';

/**
 * Where Stripe sends people back: /billing/success, /billing/cancel,
 * /billing/return (from the portal). The app polls the API on its own, so
 * this page only needs to say "you can go back to the app".
 */
export default function BillingReturn() {
  const { pathname } = useLocation();
  const kind = pathname.endsWith('/success')
    ? 'success'
    : pathname.endsWith('/cancel')
      ? 'cancel'
      : 'return';
  useEffect(() => {
    document.title = `${kind === 'success' ? 'Thank you' : 'Billing'} — ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [kind]);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <div className="relative z-10 max-w-md w-full bg-panel border border-border rounded-[var(--radius)] p-6 text-center">
        <h1 className="font-display text-2xl text-text">
          {kind === 'success'
            ? 'You’re all set'
            : kind === 'cancel'
              ? 'No changes made'
              : 'Billing updated'}
        </h1>
        <p className="text-sm text-text-muted mt-2">
          {kind === 'success'
            ? 'Your plan is active. Switch back to Crux Garden — it has already picked it up. A receipt is on its way from Stripe.'
            : kind === 'cancel'
              ? 'Checkout was cancelled. Your plan is unchanged; you can pick one any time from Settings → Plan.'
              : 'Anything you changed is reflected in the app within a few seconds.'}
        </p>
        <div className="mt-5 flex justify-center gap-3 text-xs font-mono">
          <Link to="/" className="text-text-muted hover:text-text">
            crux.garden
          </Link>
          <Link to="/explore" className="text-text-muted hover:text-text">
            Explore
          </Link>
        </div>
      </div>
    </div>
  );
}
