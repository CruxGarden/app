import { useEffect, useState } from 'react';
import client from '@/api/client';
import { captureAuth, assertAuthCurrent, clearTokens } from '@/api/session';
import { apiBaseUrl } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input } from '@/components/ui';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { useInvoices } from '@/hooks/useInvoices';
import { InvoiceList } from './Invoices';

/** What closing does to a subscription, said once and the same everywhere. */
export const CLOSING_PLAN_NOTE =
  'Closing ends your plan now. Remaining time isn’t refunded. We’ll email your invoice links.';

/** Kept separate from disconnecting: this is the server account's destructive lifecycle. */
export default function CloseAccount() {
  const account = useAuthStore((s) => s.account);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const invoices = useInvoices(open ? account?.id : undefined);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setChecking(true);
    setAvailable(false);
    setError('');
    void client
      .get<{ version: number }>('/account/closure')
      .then(({ data }) => {
        if (current) {
          setAvailable(data.version === 1);
          if (data.version !== 1)
            setError('This server needs an update before it can safely close accounts.');
        }
      })
      .catch(() => {
        if (current)
          setError(
            'Could not check account closure support. Retry, or update your self-hosted server.',
          );
      })
      .finally(() => {
        if (current) setChecking(false);
      });
    return () => {
      current = false;
    };
  }, [open, retry, account?.id]);
  const close = async () => {
    if (!account || !available || confirmation !== 'DELETE MY ACCOUNT' || busy) return;
    const context = captureAuth();
    const id = account.id;
    if (
      !(await confirmDialog({
        title: 'Permanently close this account?',
        message: `Close ${account.email} at ${new URL(apiBaseUrl()).host}? ${CLOSING_PLAN_NOTE} Your local Garden stays on this device.`,
        confirmLabel: 'Close account',
        danger: true,
      }))
    )
      return;
    setBusy(true);
    setError('');
    try {
      assertAuthCurrent(context);
      if (useAuthStore.getState().account?.id !== id)
        throw new Error('The connected account changed. Open this section again.');
      await client.delete('/account', {
        data: { confirmationText: confirmation },
        authContext: context,
        timeout: 120_000,
      });
      assertAuthCurrent(context);
      try {
        await clearTokens(context);
        useAuthStore.setState({ account: null, isAuthenticated: false, connectionError: null });
        void alertDialog(
          'Your hosted account is closed. Your local Garden and files are still here.',
          'Account closed',
        );
      } catch {
        useAuthStore.setState({
          account: null,
          isAuthenticated: false,
          connectionError:
            'Account closed, but saved credentials could not be removed from this device. Restore credential storage and disconnect again.',
        });
      }
    } catch (error) {
      setError(
        `Account closure did not finish. Some cleanup may already be complete; retry to finish. ${error instanceof Error ? error.message : ''}`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Close hosted account">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} disabled={busy}>
        {open ? 'Keep my account' : 'Close hosted account…'}
      </Button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <p>
            Closing <strong>{account?.email}</strong> at{' '}
            <strong>{new URL(apiBaseUrl()).host}</strong> removes your Explore profile, shared
            sites, tools and Moods, custom-domain routes and hosted backups.
          </p>
          <p data-testid="close-account-plan-note">{CLOSING_PLAN_NOTE}</p>
          {invoices.status === 'ready' && invoices.invoices.length > 0 && (
            <div className="space-y-1" data-testid="close-account-invoices">
              <p className="text-xs text-text-muted">
                Download any invoices you need now; they may not be reachable here afterwards.
              </p>
              <InvoiceList invoices={invoices.invoices} />
            </div>
          )}
          <p>
            Your local Garden, files, history and installed tools stay on this device. Export any
            hosted Store data you want to keep first. Copies other people downloaded remain theirs.
            CDN removal can take time to reach every visitor.
          </p>
          <p className="text-xs text-text-muted">
            This closes access; it does not promise immediate erasure of every retained database,
            operational or billing record. If cleanup fails, some sites or billing may already be
            removed. Retry to finish.
          </p>
          {checking ? (
            <p role="status">Checking server support…</p>
          ) : (
            !available && (
              <Button size="sm" onClick={() => setRetry(retry + 1)}>
                Retry check
              </Button>
            )
          )}
          <label htmlFor="account-close-confirmation">Type DELETE MY ACCOUNT to continue</label>
          <Input
            id="account-close-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy || !available}
            autoComplete="off"
          />
          <Button
            variant="danger"
            disabled={!available || confirmation !== 'DELETE MY ACCOUNT'}
            loading={busy}
            onClick={() => void close()}
          >
            Close account permanently
          </Button>
          {error && (
            <p role="alert" className="text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
