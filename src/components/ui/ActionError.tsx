import type { ActionFailure } from '@/lib/action-failure';

export default function ActionError({ failure }: { failure: ActionFailure | null }) {
  if (!failure) return null;
  return (
    <div role="alert" className="mt-3 space-y-2 text-sm text-error">
      <p>{failure.message}</p>
      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer">Technical details</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono select-text">
          {failure.detail}
        </pre>
      </details>
    </div>
  );
}
