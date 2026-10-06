import PaneOptions from '@/components/workspace/PaneOptions';
import IncludedStatus from './IncludedStatus';
import { copyIdentity } from '@/services/working-copies';
import { useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { cruxModel } from '@/ai/keys';
import { useIncludedAccess } from '@/services/included-access';
import { useCruxStore } from '@/stores/cruxStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ModelSelector from './ModelSelector';
import ModelInfoPanel from './ModelInfoPanel';
import TurnJobCard from './TurnJobCard';

export default function ChatPanel() {
  const { messages, isStreaming, streamingContent, isJobRunning, send, steer, stop } = useChat();
  useIncludedAccess((s) => s.usage);
  const crux = useCruxStore((s) => s.crux);
  const model = cruxModel(crux);
  const setModel = useCruxStore((s) => s.setModel);
  const isViewingSnapshot = useCruxStore((s) => s.viewingSnapshotId !== null);
  const copy = useCruxStore((s) => copyIdentity(s.crux));
  const locked = useCruxStore((s) => s.closing);
  const readOnlyTask = !!copy && copy.phase !== 'ready';
  const snapshotMessageCount = useCruxStore((s) => s.snapshotMessageCount);
  // The conversation's current size: the included status answers for the next turn.
  const contextTokens = useCruxStore((s) => s.tokenUsage.inputTokens);

  // When viewing a snapshot, truncate messages to what existed at that point
  const visibleMessages = useMemo(() => {
    if (isViewingSnapshot && snapshotMessageCount !== null) {
      return messages.slice(0, snapshotMessageCount);
    }
    return messages;
  }, [messages, isViewingSnapshot, snapshotMessageCount]);

  const remainingCount =
    isViewingSnapshot && snapshotMessageCount !== null ? messages.length - snapshotMessageCount : 0;

  // User message history in reverse order (most recent first) for arrow-up recall
  const history = useMemo(
    () =>
      visibleMessages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .reverse(),
    [visibleMessages],
  );

  return (
    <div className="flex flex-col h-full">
      <p className="shrink-0 px-3 pt-2 text-xs text-text-muted">Working on: {crux?.title}</p>
      <MessageList
        messages={visibleMessages}
        streamingContent={isViewingSnapshot ? '' : streamingContent}
        isStreaming={isViewingSnapshot ? false : isStreaming}
        truncatedAfter={remainingCount > 0 ? remainingCount : undefined}
      />
      {isViewingSnapshot || readOnlyTask || locked ? (
        <div className="border-t border-border px-3 py-3">
          <div className="text-xs font-mono text-text-muted text-center">
            {readOnlyTask
              ? 'This task’s Collaboration is preserved. Reopen an archived task or start a new task to continue.'
              : locked
                ? 'A task operation is in progress.'
                : 'Chat is read-only while viewing a snapshot'}
          </div>
        </div>
      ) : (
        <div className="border-t border-border/(--tint-medium)">
          <TurnJobCard />
          {model === 'garden-included' && (
            <div className="px-3 pt-2">
              <IncludedStatus contextTokens={contextTokens} />
            </div>
          )}
          <MessageInput
            onSend={send}
            onSteer={steer}
            onStop={stop}
            isStreaming={isStreaming || isJobRunning}
            history={history}
          />
          {/* Beneath the composer: the model chip and its usage. */}
          <div className="px-3 pb-2 flex items-center gap-x-3 gap-y-1.5 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <PaneOptions pane="collaboration" label="AI model and options">
                <ModelInfoPanel model={model}>
                  <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
                </ModelInfoPanel>
              </PaneOptions>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
