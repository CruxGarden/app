import { useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { resolveModel } from '@/ai/providers';
import { useCruxStore } from '@/stores/cruxStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ModelSelector from './ModelSelector';
import ModelInfoPanel from './ModelInfoPanel';
import TurnJobCard from './TurnJobCard';

export default function ChatPanel() {
  const { messages, isStreaming, streamingContent, isJobRunning, send, steer, stop } = useChat();
  const model = useCruxStore((s) =>
    resolveModel(s.crux?.meta?.settings?.model as string | undefined),
  );
  const setModel = useCruxStore((s) => s.setModel);
  const isViewingSnapshot = useCruxStore((s) => s.viewingSnapshotId !== null);
  const snapshotMessageCount = useCruxStore((s) => s.snapshotMessageCount);

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
      <MessageList
        messages={visibleMessages}
        streamingContent={isViewingSnapshot ? '' : streamingContent}
        isStreaming={isViewingSnapshot ? false : isStreaming}
        truncatedAfter={remainingCount > 0 ? remainingCount : undefined}
      />
      {isViewingSnapshot ? (
        <div className="border-t border-border px-3 py-3">
          <div className="text-xs font-mono text-text-muted text-center">
            Chat is read-only while viewing a snapshot
          </div>
        </div>
      ) : (
        <div className="border-t border-border">
          <div className="px-3 pt-2.5 pb-1">
            <ModelInfoPanel model={model}>
              <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
            </ModelInfoPanel>
          </div>
          <TurnJobCard />
          <MessageInput
            onSend={send}
            onSteer={steer}
            onStop={stop}
            isStreaming={isStreaming || isJobRunning}
            history={history}
          />
        </div>
      )}
    </div>
  );
}
