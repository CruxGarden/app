import type { ReactNode } from 'react';
import type { ToolCall } from '@/api/types';
import MarkdownRenderer from './MarkdownRenderer';
import ToolCallRows from './ToolCallRows';

/**
 * The shared look of a collaborator's reply (Daniel, 2026-09-20: the
 * Collaboration's, and now the Keeper's console too): a small avatar, the
 * name, prose in the reading face, the work folded beneath, a quiet footer.
 * Presentational — the Collaboration and the console supply their own state.
 */
export function Reply({
  avatar,
  name,
  content,
  toolCalls,
  footer,
  streaming = false,
  children,
}: {
  avatar: ReactNode;
  name?: string | null;
  content: string;
  toolCalls?: ToolCall[];
  footer?: string[];
  streaming?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex gap-1.5 items-start motion-enter-bubble"
      data-role="assistant"
      {...(streaming ? { 'data-streaming': 'true' } : {})}
    >
      <div className="pt-0.5">{avatar}</div>
      <div className="min-w-0 flex-1 pl-2 border-l-2 border-chat-ai-bubble-border text-chat-ai-bubble-text">
        {name && <div className="text-2xs font-mono text-accent mb-1">{name}</div>}
        <div className="font-reading text-[0.95rem] leading-[1.6] break-words">
          <MarkdownRenderer content={content} />
          {streaming && (
            <span className="inline-block w-1.5 h-4 bg-accent/60 motion-attention ml-0.5 align-text-bottom" />
          )}
        </div>
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-2">
            <ToolCallRows calls={toolCalls} />
          </div>
        )}
        {children}
        {footer && footer.length > 0 && (
          <div className="mt-1.5 text-2xs font-mono text-chat-text-muted/50">
            {footer.join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

/** The person's words: a pill on the right, the name above it, an avatar beside it. */
export function PersonPill({
  content,
  name,
  avatar,
  testId,
}: {
  content: string;
  name?: string | null;
  avatar?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex gap-2 items-end justify-end motion-enter-bubble"
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <div className="max-w-[82%] min-w-0">
        {name && (
          <div className="text-2xs font-mono text-chat-text-muted/80 mb-1 text-right">{name}</div>
        )}
        <div className="rounded-bubble px-3.5 py-2 text-sm break-words border bg-chat-user-bubble text-chat-user-bubble-text border-chat-user-bubble-border">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
      {avatar}
    </div>
  );
}

/** One quiet line while the collaborator works. */
export function StatusLine({ text, testId = 'turn-status' }: { text: string; testId?: string }) {
  return (
    <div
      className="flex items-center gap-2 pl-10 text-2xs font-mono text-chat-text-muted"
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent motion-attention shrink-0" />
      <span>{text}</span>
    </div>
  );
}
