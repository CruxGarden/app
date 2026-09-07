import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import * as usageApi from '@/api/usage';
import { periodDay } from '@/lib/period-day';
import { PaneSection } from './pane-ui';

/** Storage and bandwidth for one published crux, this billing period. */
export default function UsageSection({
  cruxId,
  refreshKey,
}: {
  cruxId: string;
  refreshKey?: unknown;
}) {
  const [usage, setUsage] = useState<usageApi.CruxUsage | null>(null);
  const [account, setAccount] = useState<usageApi.AccountUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([usageApi.forCrux(cruxId), usageApi.me()])
      .then(([u, a]) => {
        if (cancelled) return;
        setUsage(u);
        setAccount(a);
      })
      .catch(() => {
        if (!cancelled) setError('Usage is unavailable right now');
      });
    return () => {
      cancelled = true;
    };
  }, [cruxId, refreshKey]);

  if (error) return null;
  if (!usage || !account) return null;
  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
  const storagePct = pct(usage.storageBytes, account.plan.storageBytes);
  const bandwidthPct = pct(usage.bandwidthBytes, account.plan.bandwidthBytesPerPeriod);

  return (
    <PaneSection
      label="Usage"
      aside={`${periodDay(account.period.start)} → ${periodDay(account.period.end)}`}
      data-testid="crux-usage"
    >
      <div className="flex flex-col gap-2">
        <Meter
          label="Storage"
          value={formatBytes(usage.storageBytes)}
          hint={`${usage.files} file${usage.files === 1 ? '' : 's'} · ${storagePct.toFixed(1)}% of your ${formatBytes(account.plan.storageBytes)}`}
          pct={storagePct}
        />
        <Meter
          label="Bandwidth"
          value={formatBytes(usage.bandwidthBytes)}
          hint={`${usage.requests.toLocaleString()} request${usage.requests === 1 ? '' : 's'} · ${bandwidthPct.toFixed(1)}% of ${formatBytes(account.plan.bandwidthBytesPerPeriod)} this period`}
          pct={bandwidthPct}
        />
        <Audience usage={usage} />
        {(usage.storeKeys > 0 || usage.storeReads + usage.storeWrites > 0) && (
          <div className="flex items-baseline justify-between gap-2 text-xxs">
            <span className="text-text">Crux Store</span>
            <span className="font-mono text-text-muted">
              {formatBytes(usage.storeBytes)} · {usage.storeKeys} key
              {usage.storeKeys === 1 ? '' : 's'} ·{' '}
              {(usage.storeReads + usage.storeWrites).toLocaleString()} requests
            </span>
          </div>
        )}
        {!account.bandwidthAsOf && (
          <p className="text-2xs text-text-muted">Bandwidth updates as visits are counted.</p>
        )}
      </div>
    </PaneSection>
  );
}

/**
 * People, not bytes: distinct visitors per day (from the edge logs, hashed
 * per day — never linked across days) and players (signed-in visitors who
 * wrote to the Crux Store). Today / last 7 days / this period, with the
 * daily series as a small bar strip.
 */
function Audience({ usage }: { usage: usageApi.CruxUsage }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const sum = (from: string, pick: (d: usageApi.DailyAudience) => number) =>
    usage.daily.filter((d) => d.day >= from).reduce((s, d) => s + pick(d), 0);
  const hasPlayers = usage.players > 0;
  if (usage.visitors === 0 && !hasPlayers) {
    return (
      <div
        className="flex items-baseline justify-between gap-2 text-xxs"
        data-testid="crux-audience"
      >
        <span className="text-text">Visitors</span>
        <span className="font-mono text-text-muted">none counted yet</span>
      </div>
    );
  }
  const strip = usage.daily.slice(-30);
  const max = Math.max(1, ...strip.map((d) => d.visitors));
  return (
    <div className="flex flex-col gap-1" data-testid="crux-audience">
      <Row
        label="Visitors"
        today={sum(today, (d) => d.visitors)}
        week={sum(weekAgo, (d) => d.visitors)}
        period={usage.visitors}
      />
      {hasPlayers && (
        <Row
          label="Players"
          today={sum(today, (d) => d.players)}
          week={sum(weekAgo, (d) => d.players)}
          period={usage.players}
          hint="signed in and wrote to the Crux Store"
        />
      )}
      {strip.length > 1 && (
        <div
          className="flex items-end gap-px h-4"
          role="img"
          aria-label={`Daily visitors, ${strip.length} days`}
          title="Daily visitors"
        >
          {strip.map((d) => (
            <div
              key={d.day}
              className="flex-1 bg-meter-fill rounded-[1px] min-h-px"
              style={{ height: `${Math.max(6, (d.visitors / max) * 100)}%` }}
              title={`${d.day}: ${d.visitors} visitor${d.visitors === 1 ? '' : 's'}${d.players ? `, ${d.players} player${d.players === 1 ? '' : 's'}` : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  today,
  week,
  period,
  hint,
}: {
  label: string;
  today: number;
  week: number;
  period: number;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xxs">
      <span className="text-text" title={hint}>
        {label}
      </span>
      <span className="font-mono text-text-muted">
        <span className="text-text">{today.toLocaleString()}</span> today · {week.toLocaleString()}{' '}
        this week · {period.toLocaleString()} this period
      </span>
    </div>
  );
}

export function Meter({
  label,
  value,
  hint,
  pct,
}: {
  label: string;
  value: string;
  hint: string;
  pct: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xxs">
        <span className="text-text">{label}</span>
        <span className="font-mono text-text">{value}</span>
      </div>
      <div
        className="rounded-meter bg-meter-track overflow-hidden"
        style={{ height: 'var(--meter-height)' }}
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-meter transition-[width]',
            pct >= 90 ? 'bg-meter-danger' : pct >= 70 ? 'bg-meter-warn' : 'bg-meter-fill',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-2xs text-text-muted">{hint}</div>
    </div>
  );
}
