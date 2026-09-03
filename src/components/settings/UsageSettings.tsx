import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Panel } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import * as usageApi from '@/api/usage';
import { useGardenStore } from '@/stores/gardenStore';
import { Meter } from '@/components/workspace/UsageSection';

/** Account-wide storage and bandwidth for the billing period, against the plan. */
export default function UsageSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cruxes = useGardenStore((s) => s.allCruxes);
  const [usage, setUsage] = useState<usageApi.AccountUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    usageApi
      .me()
      .then((u) => !cancelled && setUsage(u))
      .catch(() => !cancelled && setError('Usage is unavailable right now'));
    return () => {
      cancelled = true;
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
              label="Published storage"
              value={formatBytes(usage.storageBytes)}
              hint={`of ${formatBytes(usage.plan.storageBytes)} · ${usage.cruxes.filter((c) => c.storageBytes > 0).length} published crux${usage.cruxes.filter((c) => c.storageBytes > 0).length === 1 ? '' : 'es'}`}
              pct={
                usage.plan.storageBytes
                  ? Math.min(100, (usage.storageBytes / usage.plan.storageBytes) * 100)
                  : 0
              }
            />
            <Meter
              label="Bandwidth this period"
              value={formatBytes(usage.bandwidthBytes)}
              hint={`of ${formatBytes(usage.plan.bandwidthBytesPerPeriod)} · ${usage.requests.toLocaleString()} requests${usage.bandwidthAsOf ? ` · counted ${day(usage.bandwidthAsOf)}` : ''}`}
              pct={
                usage.plan.bandwidthBytesPerPeriod
                  ? Math.min(100, (usage.bandwidthBytes / usage.plan.bandwidthBytesPerPeriod) * 100)
                  : 0
              }
            />
          </div>
          {usage.cruxes.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-caption font-mono uppercase tracking-wider text-[9px]">
                  <th className="py-1 font-normal">Crux</th>
                  <th className="py-1 font-normal text-right">Storage</th>
                  <th className="py-1 font-normal text-right">Bandwidth</th>
                  <th className="py-1 font-normal text-right">Requests</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-text-muted">
            Limits are shown, not enforced yet. Plans that raise them are coming.
          </p>
        </div>
      )}
    </Panel>
  );
}
