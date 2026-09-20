import type { ReactNode, RefObject, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * The pill composer's frame (Daniel, 2026-09-20): leading control on the
 * left, the words in the middle, Send or Stop on the right. The Collaboration
 * and the Keeper's console share it; each supplies its own textarea props and
 * any extra buttons (Steer, Queue).
 */
export const composerRound =
  'w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed';

export function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export default function ComposerPill({
  textareaRef,
  textarea,
  leading,
  extra,
  streaming,
  canSend,
  onSend,
  onStop,
  hint,
  testId = 'composer',
}: {
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
  leading?: ReactNode;
  extra?: ReactNode;
  streaming: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop?: () => void;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="px-3 pb-2 pt-2 bg-chat-composer">
      <div
        className={cn(
          'flex items-end gap-1.5 rounded-[22px] border px-2 py-1.5',
          'bg-chat-input border-chat-input-border focus-within:border-chat-input-border-focus transition-colors',
        )}
        data-testid={testId}
      >
        {leading}
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Send a message..."
          {...textarea}
          className={cn(
            'flex-1 min-w-0 resize-none bg-transparent border-0 px-1 py-1.5',
            'text-sm text-chat-input-text placeholder:text-chat-input-placeholder leading-[1.4]',
            'focus:outline-none font-body max-h-[200px]',
            textarea.className,
          )}
        />
        {extra}
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop this turn"
            className={cn(
              composerRound,
              'bg-danger-button text-on-error border border-danger-button-border hover:bg-danger-button-hover',
            )}
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className={cn(
              composerRound,
              'bg-chat-send-button text-chat-send-button-icon border border-chat-send-button/20',
              'hover:bg-chat-send-button-hover motion-press react-accent disabled:opacity-40',
            )}
          >
            <SendIcon />
          </button>
        )}
      </div>
      {hint && <p className="text-xxs text-chat-text-muted/70 mt-1.5 px-2">{hint}</p>}
    </div>
  );
}
