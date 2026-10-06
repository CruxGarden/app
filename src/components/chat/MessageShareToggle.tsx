import { useState } from 'react';
import type { ChatMessage } from '@/api/types';
import { iconButtonClass } from '@/components/ui/button-class';
import { useCruxStore } from '@/stores/cruxStore';
import { conversationShared, isExcludedFromPublish } from '@/services/shared-conversation';
import { shareToggleLabel } from './message-actions';

/**
 * Leave one message out of the shared conversation (CR06). Offered only while
 * the Crux shares its conversation; quiet like Copy — it appears as the pointer
 * or the keyboard reaches its message.
 */
export function MessageShareToggle({
  message,
  className,
}: {
  message: ChatMessage;
  className?: string;
}) {
  const crux = useCruxStore((s) => s.crux);
  const setExcluded = useCruxStore((s) => s.setMessageExcludedFromPublish);
  const [busy, setBusy] = useState(false);
  if (!conversationShared(crux)) return null;
  const excluded = isExcludedFromPublish(message, crux);
  const label = shareToggleLabel(excluded);
  return (
    <button
      type="button"
      data-testid="message-share-toggle"
      data-excluded={excluded ? 'true' : 'false'}
      aria-label={label}
      title={message.role === 'user' ? `${label} — with its replies` : label}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setExcluded(message, !excluded);
        } finally {
          setBusy(false);
        }
      }}
      className={iconButtonClass(
        'xs',
        excluded,
        [
          'transition-[opacity,color,background-color,transform]',
          // A visibility reveal, not a dim: hidden until its message is reached.
          !excluded &&
            'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
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
        {excluded ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c5.5 0 9.5 5 10 7a13 13 0 0 1-3.2 4.2" />
            <path d="M6.6 6.6C4 8.2 2.4 10.8 2 12c.5 2 4.5 7 10 7 1.8 0 3.4-.5 4.8-1.3" />
          </>
        ) : (
          <>
            <path d="M2 12c.5-2 4.5-7 10-7s9.5 5 10 7c-.5 2-4.5 7-10 7S2.5 14 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

/** The quiet note under a message that stays out of the shared conversation. */
export function MessageShareMarker({ message }: { message: ChatMessage }) {
  const crux = useCruxStore((s) => s.crux);
  if (!isExcludedFromPublish(message, crux)) return null;
  return (
    <span className="text-2xs font-mono text-chat-text-muted" data-testid="message-excluded-marker">
      Not in shared conversation
    </span>
  );
}
