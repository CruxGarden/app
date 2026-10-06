import { useEffect } from 'react';
import {
  refreshIncludedAccess,
  setIncludedContextTokens,
  useIncludedAccess,
} from '@/services/included-access';
import { composerAllowance, formatRelease, remainingLine } from '@/services/included-allowance';
import { linkClass } from '@/components/ui/button-class';
import { useUIStore } from '@/stores/uiStore';

/**
 * Plain-language subscription status where the person is about to use it.
 * With `contextTokens` (the composer), the status answers for the next turn
 * of this conversation: paused, shorter replies, or nearly at the limit.
 */
export default function IncludedStatus({ contextTokens }: { contextTokens?: number } = {}) {
  const { status, usage } = useIncludedAccess();
  const composer = contextTokens !== undefined;
  useEffect(() => {
    if (composer) setIncludedContextTokens(contextTokens);
  }, [composer, contextTokens]);
  useEffect(() => {
    if (composer) return () => setIncludedContextTokens(null);
  }, [composer]);

  // While a re-check runs, keep saying what the last answer said.
  const known = status === 'ready' || (status === 'checking' && !!usage);
  const ready = known && !!usage?.eligible && usage.available;
  const allowance = ready && usage ? composerAllowance(usage) : null;
  const when = (iso: string | null) => (iso ? formatRelease(iso) : null);
  const message =
    status === 'signed-out'
      ? 'Sign in to use the collaboration included with your plan.'
      : status === 'checking' && !usage
        ? 'Checking your included collaboration…'
        : status === 'unavailable'
          ? 'Can’t check included collaboration. Check your connection and try again.'
          : !usage?.eligible
            ? 'Included collaboration comes with a Gardener plan.'
            : !usage.available
              ? 'Included collaboration is temporarily unavailable. Please try again shortly.'
              : allowance?.kind === 'paused'
                ? `Included allowance reached. Collaboration is paused${when(allowance.until) ? ` until ${when(allowance.until)}` : ''}. Your work stays here.`
                : allowance?.kind === 'shorter'
                  ? `Replies may be shorter${when(allowance.until) ? ` until ${when(allowance.until)}` : ' for now'}.`
                  : allowance?.kind === 'nearly'
                    ? 'Included collaboration is nearly at its limit. No extra charges.'
                    : 'Included with your plan · no API key needed';
  const remaining = ready && usage ? remainingLine(usage) : null;
  const openSettings = () => useUIStore.getState().setSettingsOpen(true);
  return (
    <div
      data-testid="included-status"
      data-allowance={allowance?.kind}
      className="text-xs text-text-muted space-y-1"
      role="status"
    >
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span>{message}</span>
        {remaining && (
          <span className="text-xxs font-mono text-text-muted" data-testid="included-remaining">
            {remaining}
          </span>
        )}
      </p>
      {status === 'ready' && usage?.eligible && usage.imagesAvailable === false && (
        <p>Image generation is temporarily unavailable. You can still use your own images.</p>
      )}
      <div className="flex flex-wrap gap-x-3">
        {status === 'unavailable' || (status === 'ready' && usage?.eligible && !usage.available) ? (
          <button className={linkClass()} onClick={() => void refreshIncludedAccess()}>
            Try again
          </button>
        ) : null}
        {allowance?.kind === 'paused' && (
          <button className={linkClass()} onClick={openSettings}>
            Use your own key
          </button>
        )}
        {status === 'signed-out' ||
        (known && (!usage?.eligible || (allowance && allowance.kind !== 'ok'))) ? (
          <button className={linkClass()} onClick={openSettings}>
            View account and allowance
          </button>
        ) : null}
      </div>
    </div>
  );
}
