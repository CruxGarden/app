import { useEffect, useRef, useState } from 'react';
import { iconButtonClass } from '@/components/ui/button-class';
import { copyLabel, copyMessageText, type CopyOutcome } from './message-actions';

/** How long "Copied" stays before the action goes quiet again. */
const CONFIRM_MS = 1600;

/**
 * Copy a message's text (EF05). Quiet: it appears as the pointer or the
 * keyboard reaches its message — the message wears `group/message` — and it is
 * always in the tab order. The icon and the name both confirm the copy.
 */
export default function MessageCopy({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | CopyOutcome>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!content.trim()) return null;
  const label = copyLabel(state);
  return (
    <button
      type="button"
      data-testid="message-copy"
      data-state={state}
      aria-label={label}
      title={label}
      onClick={async () => {
        const outcome = await copyMessageText(content);
        setState(outcome);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), CONFIRM_MS);
      }}
      className={iconButtonClass(
        'xs',
        state === 'copied',
        [
          'transition-[opacity,color,background-color,transform]',
          // A visibility reveal, not a dim: hidden until its message is reached.
          state === 'idle' &&
            'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
          state === 'failed' && 'text-error',
          className,
        ]
          .filter(Boolean)
          .join(' '),
      )}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {state === 'copied' ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </>
        )}
      </svg>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'idle' ? '' : label}
      </span>
    </button>
  );
}
