import ConversationViewport from './ConversationViewport';
import type { ChatMessage } from '@/api/types';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useAppStore } from '@/stores/appStore';
import MessageBubble from './MessageBubble';
import { ConsoleAvatar } from '@/components/keeper/Console';
import MarkdownRenderer from './MarkdownRenderer';
import TurnStatus from './TurnStatus';
import ToolCallRows from './ToolCallRows';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { chipClass } from '@/components/ui/button-class';

/** Three ways in for an empty Collaboration: a click puts one in the composer, to edit or send. */
const EXAMPLES = [
  'A one-page site about my project',
  'A tiny game I can play in the browser',
  'A reading list I can share',
];

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  truncatedAfter?: number;
}

export default function MessageList({
  messages,
  streamingContent,
  isStreaming,
  truncatedAfter,
}: MessageListProps) {
  const cruxId = useCruxStore((s) => s.crux?.id);
  const author = useAppStore((s) => s.author);
  // The work as it happens, folded under the reply being written — the same
  // one expandable line the finished reply keeps, and the same line the
  // console has always shown while the Keeper works.
  const liveToolCalls = useCruxStore((s) => s.streamingToolCalls);

  const userInitial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const setComposerDraft = useWorkspaceUIStore((s) => s.setComposerDraft);
  const started = messages.some((m) => m.role === 'user');
  const avatarUrl = useAvatarUrl(author);

  return (
    <ConversationViewport
      label="Collaboration messages"
      resetKey={cruxId}
      sentCount={messages.filter((message) => message.role === 'user').length}
      className="space-y-5"
    >
      {messages.length === 0 && !isStreaming && (
        <div className="text-text-muted">
          <p className="text-sm font-medium">What would you like to make?</p>
          <p className="text-xs mt-2">
            Describe the result you have in mind and who it is for. Choose a collaborator below,
            then send your idea. Your creation will appear in the Workshop as it takes shape.
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} avatarUrl={avatarUrl} userInitial={userInitial} />
      ))}

      {!started && !isStreaming && (
        <div
          className="flex flex-wrap gap-1.5 pl-8"
          role="group"
          aria-label="Examples to start from"
        >
          {EXAMPLES.map((example, i) => (
            <button
              key={example}
              type="button"
              style={{ '--enter-index': i } as React.CSSProperties}
              className={chipClass(false, 'h-7 px-3 font-body text-xs motion-enter-card')}
              onClick={(event) => {
                setComposerDraft(example);
                // This pane's composer: several workspaces can be mounted at once.
                event.currentTarget
                  .closest('[data-testid="pane-body-collaboration"]')
                  ?.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')
                  ?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {truncatedAfter != null && truncatedAfter > 0 && (
        <div className="flex items-center gap-2 py-2">
          <div className="flex-1 border-t border-accent/(--tint-quiet)" />
          <span className="text-2xs font-mono text-accent/(--tint-strong) shrink-0">
            snapshot taken here — {truncatedAfter} message{truncatedAfter !== 1 ? 's' : ''} after
          </span>
          <div className="flex-1 border-t border-accent/(--tint-quiet)" />
        </div>
      )}

      {isStreaming && (streamingContent || liveToolCalls.length > 0) && (
        <div className="flex gap-1.5 items-start" data-role="assistant" data-streaming="true">
          <div className="pt-0.5">
            <ConsoleAvatar />
          </div>
          <div className="min-w-0 flex-1 pl-2 border-l-2 border-chat-ai-bubble-border font-body text-sm leading-[1.6] text-chat-ai-bubble-text break-words motion-enter-bubble">
            {streamingContent && (
              <>
                <MarkdownRenderer content={streamingContent} />
                <span className="inline-block w-1.5 h-4 bg-accent/(--tint-medium) motion-attention ml-0.5 align-text-bottom" />
              </>
            )}
            {liveToolCalls.length > 0 && (
              <div className={streamingContent ? 'mt-2' : undefined}>
                <ToolCallRows calls={liveToolCalls} />
              </div>
            )}
          </div>
        </div>
      )}

      {isStreaming && <TurnStatus quiet={!!streamingContent} />}
    </ConversationViewport>
  );
}
