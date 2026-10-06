import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { linkClass } from '@/components/ui/button-class';
import { Button } from '@/components/ui';
import * as domainsApi from '@/api/domains';
import * as usageApi from '@/api/usage';
import { confirmDialog } from '@/stores/dialogStore';
import { PaneSection, PaneHint, PaneNote } from './pane-ui';
import { openSettings } from '@/components/layout/app-commands';

/**
 * Connect your own domain to a published crux: enter it, create the two DNS
 * records we show, press Verify. The API takes it from pending_dns through
 * issuing (certificate) to active; we re-read the list while it's issuing.
 */
const STATUS_LABEL: Record<domainsApi.DomainStatus, string> = {
  pending_dns: 'Waiting for DNS',
  issuing: 'Issuing certificate',
  active: 'Live',
  failed: 'Failed',
};

function apiMessage(err: unknown, fallback: string): string {
  // API errors deliberately omit response bodies (which may contain secrets).
  // Translate the safe status into an action instead of expecting that body.
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Connect your account again, then retry.';
  if (status === 403)
    return 'Your account cannot change this domain. Check your plan and permissions.';
  if (status === 409) return 'That domain is already connected. Check your existing connections.';
  if (status === 429) return 'Too many requests. Wait a moment, then retry.';
  return fallback;
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setCopyError(false);
        setCopied(false);
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopyError(true);
        }
      }}
      title="Copy"
      className="text-left font-mono text-xxs text-accent hover:underline break-all cursor-pointer"
    >
      {value}
      {copied && (
        <span role="status" className="ml-1 text-text-muted">
          copied
        </span>
      )}
      {copyError && (
        <span role="alert" className="ml-1 text-error">
          Could not copy. Select the text to copy it manually.
        </span>
      )}
    </button>
  );
}

export default function CustomDomainSection({ cruxId }: { cruxId: string }) {
  const [domains, setDomains] = useState<domainsApi.CustomDomain[]>([]);
  const [adding, setAdding] = useState(false);
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-domain failure from Verify/Remove, shown on that card
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // How many domains the account's plan allows; null until known. Zero means
  // the feature is Gardener's and the section says so instead of a form.
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowance, setAllowance] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDomains(await domainsApi.list(cruxId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    try {
      setAllowance((await usageApi.me()).plan.customDomains);
    } catch {
      /* unknown allowance: the form stays, the server still decides */
    }
  }, [cruxId]);
  useEffect(() => void load(), [load]);

  // While a certificate is issuing, re-read every 20s. This is a GET — the
  // server advances the certificate on its own; `verify` is the user's button
  // and kicks off DNS/ACM work each time, so it is not what a timer calls.
  const anyIssuing = domains.some((d) => d.status === 'issuing');
  useEffect(() => {
    if (!anyIssuing) return;
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [anyIssuing, load]);

  const add = async () => {
    setBusy('add');
    setError(null);
    try {
      const d = await domainsApi.add(cruxId, hostname);
      setDomains((ds) => [...ds, d]);
      setHostname('');
      setAdding(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 400
          ? 'Enter a domain like blog.example.com, without https:// or a path.'
          : apiMessage(err, 'Could not add that domain. Check your connection and retry.'),
      );
    } finally {
      setBusy(null);
    }
  };
  const verify = async (id: string) => {
    setBusy(id);
    setRowError(null);
    try {
      const v = await domainsApi.verify(id);
      setDomains((ds) => ds.map((x) => (x.id === id ? v : x)));
    } catch (err) {
      setRowError({ id, message: apiMessage(err, 'Could not check that domain right now') });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (d: domainsApi.CustomDomain) => {
    const ok = await confirmDialog({
      message:
        d.status === 'active'
          ? `Disconnect ${d.hostname}? Visitors there will stop seeing this crux until you connect it again.`
          : `Remove ${d.hostname}? You can connect it again later.`,
      confirmLabel: d.status === 'active' ? 'Disconnect' : 'Remove',
      danger: true,
    });
    if (!ok) return;
    setBusy(d.id);
    setRowError(null);
    try {
      await domainsApi.remove(d.id);
      setDomains((ds) => ds.filter((x) => x.id !== d.id));
    } catch (err) {
      setRowError({ id: d.id, message: apiMessage(err, 'Could not remove that domain') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PaneSection label="Custom domain" data-testid="custom-domains">
      <div className="flex flex-col gap-2.5">
        {loading && (
          <p role="status" className="text-xxs text-text-muted">
            Checking domains…
          </p>
        )}
        {loadError && (
          <div role="alert" className="text-xxs text-error">
            Could not load your domains. Existing connections have not been changed.{' '}
            <button disabled={loading} className={linkClass()} onClick={() => void load()}>
              Retry loading domains
            </button>
          </div>
        )}
        {domains.map((d) => (
          <div
            key={d.id}
            className="rounded-[var(--radius-sm)] border border-border bg-surface/(--tint-medium) p-2.5 flex flex-col gap-2"
            data-testid={`domain-${d.hostname}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  d.status === 'active'
                    ? 'bg-success'
                    : d.status === 'failed'
                      ? 'bg-error'
                      : 'bg-warning',
                )}
              />
              <span className="text-xs font-mono text-text truncate flex-1">{d.hostname}</span>
              <span className="text-2xs font-mono text-text-muted">{STATUS_LABEL[d.status]}</span>
            </div>
            {d.status !== 'active' && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xxs text-text-muted">
                  Create these records at your DNS provider, then verify:
                </p>
                {d.records.some((r) => r.type === 'A' || r.type === 'ALIAS') && (
                  <p className="text-xxs text-text-muted">
                    Your site will answer at <span className="font-mono">www.{d.hostname}</span>;{' '}
                    <span className="font-mono">{d.hostname}</span> redirects there.
                    {d.records.some((r) => r.type === 'ALIAS') &&
                      ' ALIAS is also called ANAME or CNAME flattening (Route 53, Cloudflare, Namecheap, Porkbun, DNSimple have it).'}
                  </p>
                )}
                {d.records.map((r) => (
                  <div
                    key={`${r.type}:${r.name}`}
                    className="grid grid-cols-[3.2rem_1fr] gap-x-2 gap-y-0.5 text-xxs"
                  >
                    <span className="font-mono text-caption">{r.type}</span>
                    <CopyValue value={r.name} />
                    <span className="font-mono text-text-muted">→</span>
                    <CopyValue value={r.value} />
                  </div>
                ))}
                {d.error && (
                  <PaneNote tone={d.status === 'failed' ? 'error' : 'muted'} className="text-left">
                    {d.error}
                  </PaneNote>
                )}
              </div>
            )}
            {d.status === 'active' && (
              <a
                href={`https://${d.hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xxs font-mono text-accent hover:underline break-all"
              >
                https://{d.hostname}
              </a>
            )}
            {rowError?.id === d.id && (
              <PaneNote tone="error" className="text-left">
                {rowError.message}
              </PaneNote>
            )}
            <div className="flex items-center gap-1.5">
              {d.status !== 'active' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void verify(d.id)}
                  disabled={busy !== null}
                  aria-label={`Verify ${d.hostname}`}
                >
                  {busy === d.id ? 'Checking…' : 'Verify'}
                </Button>
              )}
              <button
                type="button"
                onClick={() => void remove(d)}
                disabled={busy !== null}
                aria-label={`Remove ${d.hostname}`}
                className="ml-auto text-xxs text-text-muted hover:text-error cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {adding ? (
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              autoFocus
              aria-label="Domain name"
              placeholder="blog.example.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-xs font-mono text-text placeholder:text-text-muted focus:outline-none focus:border-input-border-active"
            />
            {error && (
              <PaneNote tone="error" className="text-left">
                {error}
              </PaneNote>
            )}
            <div className="flex items-center gap-1.5">
              <Button size="sm" type="submit" disabled={!hostname.trim() || busy === 'add'}>
                {busy === 'add' ? 'Adding…' : 'Connect'}
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : !loadError && !loading && allowance === 0 && domains.length === 0 ? (
          <div data-testid="domains-gardener">
            <PaneHint align="left">
              Your own address for this crux comes with Gardener — two DNS records and a click,
              certificate included. Upgrade in{' '}
              <button
                type="button"
                className={linkClass()}
                onClick={() => openSettings({ section: 'plan' })}
              >
                Settings → Plan
              </button>
              .
            </PaneHint>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              {domains.length ? 'Connect another domain' : 'Connect a domain'}
            </Button>
            <PaneHint>Your own address for this crux. Two DNS records and a click.</PaneHint>
          </div>
        )}
      </div>
    </PaneSection>
  );
}
