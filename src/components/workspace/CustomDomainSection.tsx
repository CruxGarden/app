import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import * as domainsApi from '@/api/domains';
import { PaneSection, PaneHint, PaneNote } from './pane-ui';

/**
 * Connect your own domain to a published crux: enter it, create the two DNS
 * records we show, press Verify. The API takes it from pending_dns through
 * issuing (certificate) to active; we re-check while it's issuing.
 */
const STATUS_LABEL: Record<domainsApi.DomainStatus, string> = {
  pending_dns: 'Waiting for DNS',
  issuing: 'Issuing certificate',
  active: 'Live',
  failed: 'Failed',
};

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
      className="text-left font-mono text-[11px] text-accent hover:underline break-all cursor-pointer"
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

  const load = useCallback(async () => {
    try {
      setDomains(await domainsApi.list(cruxId));
    } catch {
      /* the section simply stays empty */
    }
  }, [cruxId]);
  useEffect(() => void load(), [load]);

  // While a certificate is issuing, re-check every 20s
  useEffect(() => {
    const issuing = domains.filter((d) => d.status === 'issuing');
    if (!issuing.length) return;
    const t = setInterval(() => {
      issuing.forEach(
        (d) =>
          void domainsApi
            .verify(d.id)
            .then((v) => setDomains((ds) => ds.map((x) => (x.id === v.id ? v : x))))
            .catch(() => {}),
      );
    }, 20_000);
    return () => clearInterval(t);
  }, [domains]);

  const add = async () => {
    setBusy('add');
    setError(null);
    try {
      const d = await domainsApi.add(cruxId, hostname);
      setDomains((ds) => [...ds, d]);
      setHostname('');
      setAdding(false);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } }).response?.data
        ?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not add that domain');
    } finally {
      setBusy(null);
    }
  };
  const verify = async (id: string) => {
    setBusy(id);
    try {
      const v = await domainsApi.verify(id);
      setDomains((ds) => ds.map((x) => (x.id === id ? v : x)));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: string) => {
    setBusy(id);
    try {
      await domainsApi.remove(id);
      setDomains((ds) => ds.filter((x) => x.id !== id));
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
              <span className="text-[10px] font-mono text-text-muted">
                {STATUS_LABEL[d.status]}
              </span>
            </div>
            {d.status !== 'active' && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] text-text-muted">
                  Create these two records at your DNS provider, then verify:
                </p>
                {d.records.map((r) => (
                  <div
                    key={r.type}
                    className="grid grid-cols-[3.2rem_1fr] gap-x-2 gap-y-0.5 text-[10px]"
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
                className="text-[11px] font-mono text-accent hover:underline break-all"
              >
                https://{d.hostname}
              </a>
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
                onClick={() => void remove(d.id)}
                disabled={busy !== null}
                aria-label={`Remove ${d.hostname}`}
                className="ml-auto text-[11px] text-text-muted hover:text-error cursor-pointer disabled:opacity-50"
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
              className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-xs font-mono text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
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
