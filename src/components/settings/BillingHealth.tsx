import { useEffect, useRef, useState } from 'react';
import * as billing from '@/api/billing';
import { apiBaseUrl } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';

/** Operators see actionable state; ordinary subscribers never see this section. */
export default function BillingHealth({ accountId }: { accountId: string }) {
  const [health, setHealth] = useState<billing.BillingHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  const refresh = async (reconcileId?: string) => {
    if (busy) return;
    const request = ++version.current,
      origin = apiBaseUrl();
    const current = () =>
      request === version.current &&
      useAuthStore.getState().isAuthenticated &&
      useAuthStore.getState().account?.id === accountId &&
      apiBaseUrl() === origin;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = reconcileId ? await billing.reconcileAccount(reconcileId) : null;
      if (!current()) return;
      const next = await billing.operations();
      if (!current()) return;
      setHealth(next);
      if (result)
        setNotice(
          result.status === 'verified'
            ? 'Provider state verified.'
            : result.status === 'busy'
              ? 'Another worker is already checking this account.'
              : 'Verification failed. The failure remains recorded for retry.',
        );
    } catch {
      if (current())
        setError(
          'Billing health is unavailable. Try again; the previous snapshot may be out of date.',
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <details className="mt-4 text-xs text-text-muted" data-testid="billing-health">
      <summary className="cursor-pointer text-text-primary">Billing health · operator</summary>
      <p className="my-2">
        Checks this API’s subscriptions and delivery queues. Refresh to read the latest state.
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh billing health
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void refresh(accountId)}
        >
          Reconcile my account
        </Button>
      </div>
      {busy && <p role="status">Checking billing…</p>}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {health && (
        <>
          <p>
            Provider: {health.provider}. Automatic checks:{' '}
            {health.scheduler.enabled ? 'enabled' : 'disabled'}. Email:{' '}
            {health.emailDelivery === 'ses'
              ? 'delivery configured'
              : 'logging only — delivery unconfigured'}
            .
          </p>
          <p>
            Last worker batch:{' '}
            {health.scheduler.lastRun
              ? new Date(health.scheduler.lastRun).toLocaleString()
              : 'none recorded by this API process'}
            {health.scheduler.lastRunFailed ? ' · failed' : ''}.
          </p>
          <p>
            Prices: {health.prices.available ? 'available' : 'unavailable'}
            {health.prices.missing?.length
              ? ` · ${health.prices.missing.length} plan/interval prices missing`
              : ''}
            .
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 my-2">
            {(
              [
                ['Failed account checks', health.counters.failed],
                ['Stale account checks', health.counters.stale],
                ['Unchecked accounts', health.counters.unchecked],
                ['Checks due', health.counters.due],
                ['Webhook failures', health.counters.webhookFailures],
                ['Pending checkouts', health.counters.pendingCheckouts],
                ['Ambiguous checkouts', health.counters.ambiguousCheckouts],
                ['Account closures in progress', health.counters.closingAccounts],
                ['Pending notices', health.counters.pendingNotifications],
                ['Failed notice deliveries', health.counters.failedNotifications],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="text-text-primary">{count}</dd>
              </div>
            ))}
          </dl>
          {health.problems.accounts.map((account) => (
            <div key={account.account_id} className="flex flex-wrap items-center gap-2 my-2">
              <span className="font-mono break-all">
                {account.account_id} · {account.failure_code}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                aria-label={`Retry billing check for ${account.account_id}`}
                onClick={() => void refresh(account.account_id)}
              >
                Retry check
              </Button>
            </div>
          ))}
          {health.counters.ambiguousCheckouts > 0 && (
            <p>
              Ambiguous payments need provider investigation. Use the documented recovery endpoint
              only after matching the session’s account and attempt metadata.
            </p>
          )}
        </>
      )}
    </details>
  );
}
