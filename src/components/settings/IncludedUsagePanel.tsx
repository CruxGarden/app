import { useEffect, useState } from 'react';
import { includedUsage, type IncludedUsage, INCLUDED_MODEL } from '@/api/inference';
import { useAuthStore } from '@/stores/authStore';
import { onUsageChanged } from '@/lib/usage-events';
import { Meter } from '@/components/workspace/UsageSection';
import { setDefaultModel } from '@/ai/keys';
import { getModelShortName } from '@/ai/providers';
import { SettingsKey } from '@/lib/constants';
import { setSetting } from '@/services/settings';
import { useUIStore } from '@/stores/uiStore';

export default function IncludedUsagePanel() {
  const accountId = useAuthStore((s) => s.account?.id);
  const [usage, setUsage] = useState<IncludedUsage | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    setUsage(null);
    setError(false);
    setSelected(false);
    if (!accountId) return;
    const load = async () => {
      const current = ++revision;
      try {
        const value = await includedUsage();
        if (!cancelled && current === revision) {
          setUsage(value);
          setError(false);
        }
      } catch {
        if (!cancelled && current === revision) {
          setUsage(null);
          setError(true);
        }
      }
    };
    void load();
    const off = onUsageChanged(() => void load());
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      off();
      window.clearInterval(timer);
    };
  }, [accountId]);
  if (!accountId) return null;
  return (
    <section data-testid="included-usage" className="space-y-3 border-b border-border pb-4 mb-4">
      <h3 className="font-display text-sm text-heading">Included collaboration</h3>
      {error ? (
        <p className="text-xs text-warning">
          Included usage is unavailable. No allowance estimate is shown.
        </p>
      ) : !usage ? (
        <p className="text-xs text-text-muted">Loading included allowance…</p>
      ) : (
        <>
          {!usage.available && (
            <p className="text-xs text-text-muted">
              Included collaboration is not configured on this server yet.
            </p>
          )}
          {!usage.eligible ? (
            <p className="text-xs text-text-muted">
              Gardener and Gardener Plus include collaboration. See Plan for available
              subscriptions.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {usage.windows.map((w) => (
                  <Meter
                    key={w.durationHours}
                    label={w.durationHours === 5 ? 'Rolling five hours' : 'Rolling 30 days'}
                    value={`${Math.round(w.limitMicrodollars > 0 ? (w.usedMicrodollars / w.limitMicrodollars) * 100 : 0)}% used`}
                    pct={Math.min(
                      100,
                      w.limitMicrodollars > 0
                        ? (w.usedMicrodollars / w.limitMicrodollars) * 100
                        : 0,
                    )}
                    hint={
                      w.nextReleaseAt
                        ? `Next allowance release ${new Date(w.nextReleaseAt).toLocaleString()}`
                        : 'No usage in this window'
                    }
                  />
                ))}
              </div>
              <p className="text-xs text-text-muted">
                {usage.planId === 'gardener_plus'
                  ? 'Sonnet handles included requests, thinking at full depth.'
                  : 'Sonnet handles included requests, thinking at a moderate depth.'}{' '}
                Usage varies with conversation length, files, tool calls and response size. Both
                rolling limits apply. Allowance returns as individual requests age out; annual
                billing uses the same windows.
              </p>
              <p className="text-xxs text-text-muted">
                Model for the next request: {getModelShortName(usage.model) ?? usage.model}. Updated{' '}
                {new Date(usage.asOf).toLocaleTimeString()}.
              </p>
              {usage.uncertainRequests > 0 && (
                <p className="text-xs text-warning">
                  {`${usage.uncertainRequests} running or interrupted request(s) retain a reserved allowance until final usage is known or the request ages out.`}
                </p>
              )}
              {usage.windows.some((w) => w.usedMicrodollars >= w.limitMicrodollars * 0.8) && (
                <p className="text-xs text-warning">
                  Your included allowance is nearly used. Requests pause when either window cannot
                  cover the next request. Wait for allowance to return, upgrade, or choose your own
                  API key. Extra spending is not enabled.
                </p>
              )}
              {usage.recentRequests?.length > 0 && (
                <details className="text-xxs text-text-muted">
                  <summary className="cursor-pointer">Recent included requests</summary>
                  <ul className="mt-2 space-y-1">
                    {usage.recentRequests.map((r) => (
                      <li key={r.id}>
                        {new Date(r.createdAt).toLocaleString()} ·{' '}
                        {getModelShortName(r.model) ?? r.model} ·{' '}
                        {r.status === 'complete'
                          ? 'Complete'
                          : r.status === 'rejected'
                            ? 'Rejected; no allowance used'
                            : 'Reserved; final usage unknown'}
                        {r.allowancePercent !== null
                          ? ` · ${r.allowancePercent.toFixed(2)}% of 30-day allowance`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {usage.available && (
                <button
                  className="text-xs text-accent hover:underline"
                  onClick={async () => {
                    await setDefaultModel(INCLUDED_MODEL);
                    setSetting(SettingsKey.AiEnabled, 'true');
                    useUIStore.getState().setAiEnabled(true);
                    setSelected(true);
                  }}
                >
                  {selected
                    ? 'Default set for new Collaborations'
                    : 'Use included collaborator by default'}
                </button>
              )}
            </>
          )}
        </>
      )}
      <p className="text-xxs text-text-muted">
        Included requests send conversation and selected file context through Crux Garden to
        Anthropic. Files and tool execution stay in your garden. Your own API keys use their
        providers directly; provider balances are not tracked here.
      </p>
    </section>
  );
}
