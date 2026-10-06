import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { Panel, SectionLabel, Spinner } from '@/components/ui';
import { buttonClass, linkClass } from '@/components/ui/button-class';
import { fieldClass } from '@/components/ui/field-class';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useAuthStore } from '@/stores/authStore';
import { confirmDialog } from '@/stores/dialogStore';
import { publishBaseUrlFor } from '@/lib/public-url';
import { formatDateTime } from '@/lib/format';
import { APP_NAME } from '@/lib/constants';
import * as admin from '@/api/admin';

function NotAvailable() {
  return (
    <Panel padding="md" className="text-center py-10" data-testid="operator-not-available">
      <p className="text-sm text-text">Not available</p>
    </Panel>
  );
}

function ReportRow({
  report,
  takenDown,
  onChanged,
}: {
  report: admin.AdminReport;
  takenDown: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const title = report.cruxTitle || report.cruxSlug || report.cruxId;
  return (
    <li className="py-3 flex flex-col gap-2" data-testid={`operator-report-${report.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-text">{report.reason}</span>
        <a
          href={publishBaseUrlFor(report.cruxId)}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass('text-sm')}
        >
          {title}
        </a>
        <span className="text-xs text-text-muted">{formatDateTime(report.created)}</span>
        {takenDown && <span className="text-xs text-error">Taken down</span>}
      </div>
      {report.details && (
        <p className="text-sm text-text-muted whitespace-pre-wrap break-words">{report.details}</p>
      )}
      {report.reporterEmail && (
        <p className="text-xs text-text-muted">Reporter: {report.reporterEmail}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Note"
          placeholder="Note (kept with the decision)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={fieldClass(undefined, 'flex-1 min-w-48')}
        />
        <button
          className={buttonClass('secondary', 'sm')}
          disabled={busy}
          onClick={() => void run(() => admin.updateReport(report.id, 'resolved', note))}
        >
          Resolve
        </button>
        {takenDown ? (
          <button
            className={buttonClass('secondary', 'sm')}
            disabled={busy}
            onClick={() => void run(() => admin.liftTakedown(report.cruxId))}
          >
            Lift
          </button>
        ) : (
          <button
            className={buttonClass('danger', 'sm')}
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (
                  !(await confirmDialog({
                    title: 'Take this creation down?',
                    message: `“${title}” goes offline and cannot be published again until the takedown is lifted.`,
                    confirmLabel: 'Take down',
                    danger: true,
                  }))
                )
                  return;
                await run(async () => {
                  await admin.takeDown(
                    report.cruxId,
                    note.trim() || `Reported: ${report.reason}`,
                    report.id,
                  );
                  await admin.updateReport(report.id, 'resolved', note || 'Taken down');
                });
              })()
            }
          >
            Take down
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </li>
  );
}

function AccountRow({
  account,
  onChanged,
}: {
  account: admin.AdminAccount;
  onChanged: (next: admin.AdminAccount) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<admin.AdminAccount>) => {
    setBusy(true);
    setError('');
    try {
      onChanged(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="py-3 flex flex-col gap-2" data-testid={`operator-account-${account.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-sm text-text">
          {account.username ? `@${account.username}` : account.email}
        </span>
        <span className="text-xs text-text-muted">{account.email}</span>
        {account.suspended && (
          <span className="text-xs text-error">
            Suspended {formatDateTime(account.suspended)}
            {account.suspendedReason ? ` · ${account.suspendedReason}` : ''}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {account.suspended ? (
          <button
            className={buttonClass('secondary', 'sm')}
            disabled={busy}
            onClick={() => void run(() => admin.unsuspendAccount(account.id))}
          >
            Unsuspend
          </button>
        ) : (
          <>
            <input
              aria-label="Reason"
              placeholder="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={fieldClass(undefined, 'flex-1 min-w-48')}
            />
            <button
              className={buttonClass('danger', 'sm')}
              disabled={busy || !reason.trim()}
              onClick={() => void run(() => admin.suspendAccount(account.id, reason.trim()))}
            >
              Suspend
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The operator screen (CR08): open reports with Resolve / Take down / Lift,
 * and account search with Suspend / Unsuspend. Unlisted; the API is the gate.
 */
export default function Operator() {
  usePageMeta({ title: `Operator — ${APP_NAME}`, description: 'Host moderation.' });
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.account?.role);
  const access = admin.operatorAccess(authenticated, role);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [summary, setSummary] = useState<admin.ReportSummary | null>(null);
  const [reports, setReports] = useState<admin.AdminReport[]>([]);
  const [down, setDown] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<admin.AdminAccount[] | null>(null);
  const [searchError, setSearchError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextSummary, open, active] = await Promise.all([
        admin.reportSummary(),
        admin.reports('open'),
        admin.takedowns(),
      ]);
      setSummary(nextSummary);
      setReports(open);
      setDown(new Set(active.filter((t) => !t.lifted).map((t) => t.cruxId)));
      setState('ready');
    } catch (error) {
      setState(admin.isForbidden(error) ? 'denied' : 'error');
    }
  }, []);

  useEffect(() => {
    if (access === 'denied') setState('denied');
    else void load();
  }, [access, load]);

  const search = async () => {
    setSearchError('');
    try {
      setAccounts(await admin.searchAccounts(query.trim()));
    } catch (error) {
      setSearchError(admin.isForbidden(error) ? 'Not available.' : 'Search failed. Try again.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Operator" />
      <main className="relative z-10 w-full max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        {state === 'loading' ? (
          <Panel padding="md" className="flex items-center justify-center gap-2 py-10">
            <Spinner size={14} />
            <span className="text-sm text-text-muted">Loading…</span>
          </Panel>
        ) : state === 'denied' ? (
          <NotAvailable />
        ) : state === 'error' ? (
          <Panel padding="md" className="text-center py-10" role="alert">
            <p className="text-sm text-text mb-3">Could not load moderation data.</p>
            <button className={buttonClass('secondary', 'sm')} onClick={() => void load()}>
              Try again
            </button>
          </Panel>
        ) : (
          <>
            <Panel padding="md" data-testid="operator-summary">
              <SectionLabel>Reports</SectionLabel>
              <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-text-muted text-xs">Open</dt>
                  <dd className="text-text text-lg">{summary?.open ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-text-muted text-xs">Closed, last 30 days</dt>
                  <dd className="text-text text-lg">{summary?.resolvedLast30d ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-text-muted text-xs">Taken down</dt>
                  <dd className="text-text text-lg">{summary?.takenDown ?? 0}</dd>
                </div>
              </dl>
            </Panel>

            <Panel padding="md">
              <SectionLabel>Open reports</SectionLabel>
              {reports.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">No open reports.</p>
              ) : (
                <ul className="mt-1 divide-y divide-border">
                  {reports.map((report) => (
                    <ReportRow
                      key={report.id}
                      report={report}
                      takenDown={down.has(report.cruxId)}
                      onChanged={() => void load()}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel padding="md">
              <SectionLabel>Accounts</SectionLabel>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void search();
                }}
              >
                <input
                  aria-label="Email or username"
                  placeholder="Email or username"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={fieldClass(undefined, 'flex-1')}
                />
                <button type="submit" className={buttonClass('secondary', 'sm')}>
                  Search
                </button>
              </form>
              {searchError && (
                <p role="alert" className="mt-2 text-xs text-error">
                  {searchError}
                </p>
              )}
              {accounts &&
                (accounts.length === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">No accounts match.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-border">
                    {accounts.map((account) => (
                      <AccountRow
                        key={account.id}
                        account={account}
                        onChanged={(next) =>
                          setAccounts((list) =>
                            (list ?? []).map((item) => (item.id === next.id ? next : item)),
                          )
                        }
                      />
                    ))}
                  </ul>
                ))}
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}
