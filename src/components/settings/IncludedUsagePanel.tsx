import { useEffect, useState } from 'react';
import { refreshIncludedAccess, useIncludedAccess } from '@/services/included-access';
import { INCLUDED_MODEL } from '@/api/inference';
import { useAuthStore } from '@/stores/authStore';
import { Meter } from '@/components/workspace/UsageSection';
import { setDefaultModel } from '@/ai/keys';
import { getModelShortName } from '@/ai/providers';
import { SettingsKey } from '@/lib/constants';
import { setSetting } from '@/services/settings';
import { useUIStore } from '@/stores/uiStore';
import { useGardenStore } from '@/stores/gardenStore';
import { SectionLabel } from '@/components/ui';
import { dollars, spendByCrux } from '@/services/included-allowance';

export default function IncludedUsagePanel() {
  const accountId = useAuthStore((s) => s.account?.id);
  const { usage, status } = useIncludedAccess();
  const error = status === 'unavailable';
  const [selected, setSelected] = useState(false);
  const cruxes = useGardenStore((s) => s.allCruxes);
  useEffect(() => {
    setSelected(false);
    void refreshIncludedAccess();
    const timer = window.setInterval(() => void refreshIncludedAccess(), 30000);
    return () => window.clearInterval(timer);
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
              Included collaboration is temporarily unavailable. Please try again shortly.
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
                    value={`${dollars(w.usedMicrodollars)} of ${dollars(w.limitMicrodollars)} · ${Math.round(w.limitMicrodollars > 0 ? (w.usedMicrodollars / w.limitMicrodollars) * 100 : 0)}% used`}
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
                  Your included allowance is nearly used. Replies get shorter when only a short
                  reply fits, and requests pause when either window cannot cover the next one. Wait
                  for allowance to return, upgrade, or choose your own API key. Extra spending is
                  not enabled.
                </p>
              )}
              {(() => {
                const rows = spendByCrux(
                  usage.byCrux ?? [],
                  (id) => cruxes.find((c) => c.id === id)?.title,
                );
                if (!rows.length) return null;
                return (
                  <table className="w-full text-xxs" data-testid="included-by-crux">
                    <caption className="text-left">
                      <SectionLabel>Where it went · last 30 days</SectionLabel>
                    </caption>
                    <thead>
                      <tr className="text-left text-caption font-mono uppercase tracking-wider text-2xs">
                        <th className="py-1 font-normal">Crux</th>
                        <th className="py-1 font-normal text-right">Chat</th>
                        <th className="py-1 font-normal text-right">Images</th>
                        <th className="py-1 font-normal text-right">Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-t border-border/(--tint-medium)">
                          <td className="py-1.5 text-text truncate max-w-[16rem]">{row.title}</td>
                          <td className="py-1.5 text-right font-mono text-text-muted">
                            {dollars(row.chatMicrodollars)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-text-muted">
                            {dollars(row.imageMicrodollars)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-text-muted">
                            {row.requests.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              {usage.recentRequests?.length > 0 && (
                <details className="text-xxs text-text-muted">
                  <summary className="cursor-pointer">Recent included requests</summary>
                  <ul className="mt-2 space-y-1">
                    {usage.recentRequests.map((r) => (
                      <li key={r.id}>
                        {new Date(r.createdAt).toLocaleString()} ·{' '}
                        {r.kind === 'image' ? 'Image · ' : r.kind === 'chat' ? 'Chat · ' : ''}
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
        Included chat sends conversation and selected file context through Crux Garden to Anthropic.
        Included images send the image description and any reference image through Crux Garden to
        OpenAI. Chat and images share your included allowance; image usage is estimated
        conservatively without cache discounts. Files and tool execution stay in your garden. Your
        own API keys use their providers directly; provider balances are not tracked here.
      </p>
    </section>
  );
}
