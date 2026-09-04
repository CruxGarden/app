import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Panel } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import * as usageApi from '@/api/usage';
import { useGardenStore } from '@/stores/gardenStore';
import { Meter } from '@/components/workspace/UsageSection';
import { onUsageChanged } from '@/lib/usage-events';

/** Account-wide storage and bandwidth for the billing period, against the plan. */
export default function UsageSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cruxes = useGardenStore((s) => s.allCruxes);
  const [usage, setUsage] = useState<usageApi.AccountUsage | null>(null);
  const [past, setPast] = useState<usageApi.PeriodView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const load = () => {
      usageApi
        .me()
        .then((u) => !cancelled && setUsage(u))
        .catch(() => !cancelled && setError('Usage is unavailable right now'));
      usageApi
        .periods()
        .then((p) => !cancelled && setPast(p))
        .catch(() => {});
    };
    load();
    const off = onUsageChanged(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const title = (c: usageApi.CruxUsage) =>
    c.title || cruxes.find((x) => x.id === c.cruxId)?.title || c.cruxId.slice(0, 8);
  // Period bounds are UTC dates; format them as such so the 1st doesn't show as the 31st
  const day = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    });

  return (
    <Panel data-testid="usage-settings">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-base font-medium text-heading">Usage</h2>
        {usage && (
          <span className="text-[11px] font-mono text-text-muted">
            {day(usage.period.start)} → {day(usage.period.end)} · {usage.plan.name} plan
          </span>
        )}
      </div>
      {error && <p className="text-xs text-text-muted">{error}</p>}
      {usage && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter
              label="Storage"
              value={formatBytes(usage.storageBytes)}
              hint={`of ${formatBytes(usage.plan.storageBytes)} · published ${formatBytes(usage.publish.storageBytes)} · synced ${formatBytes(usage.sync.storageBytes)} · store ${formatBytes(usage.store.storageBytes)}`}
              pct={
                usage.plan.storageBytes
                  ? Math.min(100, (usage.storageBytes / usage.plan.storageBytes) * 100)
                  : 0
              }
            />
            <Meter
              label="Bandwidth this period"
              value={formatBytes(usage.bandwidthBytes)}
              hint={`of ${formatBytes(usage.plan.bandwidthBytesPerPeriod)} · visits ${formatBytes(usage.publish.bandwidthBytes)} (${usage.requests.toLocaleString()} requests) · sync ${formatBytes(usage.sync.transferBytes)}${usage.bandwidthAsOf ? ` · counted ${day(usage.bandwidthAsOf)}` : ''}`}
              pct={
                usage.plan.bandwidthBytesPerPeriod
                  ? Math.min(100, (usage.bandwidthBytes / usage.plan.bandwidthBytesPerPeriod) * 100)
                  : 0
              }
            />
            <Meter
              label="Crux Store requests"
              value={usage.store.requests.toLocaleString()}
              hint={`of ${usage.plan.storeRequestsPerPeriod.toLocaleString()} this period · ${usage.store.reads.toLocaleString()} reads · ${usage.store.writes.toLocaleString()} writes · ${usage.store.keys.toLocaleString()} keys`}
              pct={
                usage.plan.storeRequestsPerPeriod
                  ? Math.min(100, (usage.store.requests / usage.plan.storeRequestsPerPeriod) * 100)
                  : 0
              }
            />
          </div>
          <div data-testid="sync-usage" className="flex flex-col gap-1 text-[11px]">
            <div className="text-caption font-mono uppercase tracking-wider text-[9px]">Sync</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-text">Garden backup</span>
              <span className="font-mono text-text-muted">
                {usage.sync.gardenBytes > 0
                  ? `${formatBytes(usage.sync.gardenBytes)} · pushed ${day(usage.sync.gardenSyncedAt ?? '')}`
                  : 'none'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-text">Synced cruxes</span>
              <span className="font-mono text-text-muted">
                {usage.sync.cruxCount} · {formatBytes(usage.sync.cruxBytes)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-text">Transfer this period</span>
              <span className="font-mono text-text-muted">
                ↑ {formatBytes(usage.sync.uploadBytes)} · ↓ {formatBytes(usage.sync.downloadBytes)}
              </span>
            </div>
          </div>
          {usage.cruxes.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-caption font-mono uppercase tracking-wider text-[9px]">
                  <th className="py-1 font-normal">Published crux</th>
                  <th className="py-1 font-normal text-right">Storage</th>
                  <th className="py-1 font-normal text-right">Bandwidth</th>
                  <th className="py-1 font-normal text-right">Visits</th>
                  <th className="py-1 font-normal text-right">Store</th>
                </tr>
              </thead>
              <tbody>
                {usage.cruxes.map((c) => (
                  <tr key={c.cruxId} className="border-t border-border/60">
                    <td className="py-1.5 text-text truncate max-w-[16rem]">{title(c)}</td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {formatBytes(c.storageBytes)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {formatBytes(c.bandwidthBytes)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {c.requests.toLocaleString()}
                    </td>
                    <td
                      className="py-1.5 text-right font-mono text-text-muted"
                      title={`${formatBytes(c.storeBytes)} in ${c.storeKeys} keys`}
                    >
                      {(c.storeReads + c.storeWrites).toLocaleString()} req
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {past.length > 0 && (
            <table className="w-full text-[11px]" data-testid="past-periods">
              <thead>
                <tr className="text-left text-caption font-mono uppercase tracking-wider text-[9px]">
                  <th className="py-1 font-normal">Past period</th>
                  <th className="py-1 font-normal text-right">Storage</th>
                  <th className="py-1 font-normal text-right">Bandwidth</th>
                  <th className="py-1 font-normal text-right">Plan</th>
                </tr>
              </thead>
              <tbody>
                {past.map((p) => (
                  <tr key={p.period.start} className="border-t border-border/60">
                    <td className="py-1.5 text-text">
                      {day(p.period.start)} → {day(p.period.end)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {formatBytes(p.storageBytes)}
                      {p.overStorage && <span className="text-warning"> over</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {formatBytes(p.bandwidthBytes)}
                      {p.overBandwidth && <span className="text-warning"> over</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">{p.planId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(usage.budgets.storage.overSoft || usage.budgets.bandwidth.overSoft) && (
            <p className="text-xs text-warning" data-testid="over-soft">
              You're past the soft limit on your {usage.plan.name} plan. Nothing is cut off; new
              publishes stop at twice the plan. A bigger plan is one click up in Plan.
            </p>
          )}
          <p className="text-[10px] text-text-muted" data-testid="settlement-note">
            Published sites and sync backups share these limits. Visit counts settle{' '}
            {usage.settlement.graceHours} hours after the period ends
            {usage.reconciliation
              ? usage.reconciliation.status === 'ok'
                ? ' · checked against CloudFront: matches'
                : usage.reconciliation.status === 'gap'
                  ? ' · checked against CloudFront: some visits not yet counted'
                  : ''
              : ''}
            . Shown, not enforced yet — plans that raise them are coming.
          </p>
        </div>
      )}
    </Panel>
  );
}
