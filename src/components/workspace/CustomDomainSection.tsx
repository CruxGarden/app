import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import * as domainsApi from '@/api/domains';
import { confirmDialog } from '@/stores/dialogStore';
import { PaneSection, PaneHint, PaneNote } from './pane-ui';

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
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy"
      className="text-left font-mono text-xxs text-accent hover:underline break-all cursor-pointer"
    >
      {value}
      {copied && <span className="ml-1 text-text-muted">copied</span>}
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

  const load = useCallback(async () => {
    try {
      setDomains(await domainsApi.list(cruxId));
    } catch {
      /* the section simply stays empty */
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
      setError(apiMessage(err, 'Could not add that domain'));
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
        {domains.map((d) => (
          <div
            key={d.id}
            className="rounded-[var(--radius-sm)] border border-border bg-surface/60 p-2.5 flex flex-col gap-2"
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
                <p className="text-2xs text-text-muted">
                  Create these two records at your DNS provider, then verify:
                </p>
                {d.records.map((r) => (
                  <div
                    key={`${r.type}:${r.name}`}
                    className="grid grid-cols-[3.2rem_1fr] gap-x-2 gap-y-0.5 text-2xs"
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
        ) : (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              {domains.length ? 'Connect another domain' : 'Connect a domain'}
            </Button>
            <PaneHint>Your own address for this crux, on us. Two DNS records and a click.</PaneHint>
          </div>
        )}
      </div>
    </PaneSection>
  );
}
