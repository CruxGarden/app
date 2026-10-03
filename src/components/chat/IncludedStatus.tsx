import { refreshIncludedAccess, useIncludedAccess } from '@/services/included-access';
import { useUIStore } from '@/stores/uiStore';

/** Plain-language subscription status where the person is about to use it. */
export default function IncludedStatus() {
  const { status, usage } = useIncludedAccess();
  const blocked = usage?.windows.filter((w) => w.remainingMicrodollars <= 0) ?? [];
  const low = usage?.windows.some(
    (w) => w.limitMicrodollars > 0 && w.remainingMicrodollars / w.limitMicrodollars < 0.2,
  );
  const release = blocked
    .map((w) => w.nextReleaseAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const message =
    status === 'signed-out'
      ? 'Sign in to use the AI included with your plan.'
      : status === 'checking'
        ? 'Checking your included AI…'
        : status === 'unavailable'
          ? 'Can’t check included AI. Check your connection and try again.'
          : !usage?.eligible
            ? 'Included AI requires a Gardener plan.'
            : !usage.available
              ? 'Included AI is temporarily unavailable. Please try again shortly.'
              : blocked.length
                ? `Included AI allowance reached.${release ? ` More allowance starts returning ${new Date(release).toLocaleString()}.` : ''} Your work stays here.`
                : low
                  ? 'Included AI is nearly at its limit. No extra charges.'
                  : 'AI included with your plan · no API key needed';
  return (
    <div data-testid="included-status" className="text-xs text-text-muted space-y-1" role="status">
      <p>{message}</p>
      {status === 'ready' && usage?.eligible && usage.imagesAvailable === false && (
        <p>Image generation is temporarily unavailable. You can still use your own images.</p>
      )}
      {status === 'unavailable' || (status === 'ready' && usage?.eligible && !usage.available) ? (
        <button
          className="text-accent hover:underline"
          onClick={() => void refreshIncludedAccess()}
        >
          Try again
        </button>
      ) : null}
      {status === 'signed-out' ||
      (status === 'ready' && (!usage?.eligible || blocked.length > 0 || low)) ? (
        <button
          className="text-accent hover:underline"
          onClick={() => useUIStore.getState().setSettingsOpen(true)}
        >
          View account and allowance
        </button>
      ) : null}
    </div>
  );
}
