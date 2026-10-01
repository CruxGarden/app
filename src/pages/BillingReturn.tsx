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
            ? 'Return to your Garden'
            : kind === 'cancel'
              ? 'Checkout closed'
              : 'Back from billing'}
        </h1>
        <p className="text-sm text-text-muted mt-2">
          {kind === 'success'
            ? 'Switch back to Crux Garden and open Settings → Plan to check your subscription. The app verifies your plan with the payment provider; this page alone does not confirm payment.'
            : kind === 'cancel'
              ? 'Return to Settings → Plan in Crux Garden to check your current plan or start checkout again.'
              : 'Return to Settings → Plan in Crux Garden to verify any changes. Updates may take a moment to arrive.'}
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
