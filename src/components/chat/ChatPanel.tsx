import { useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { resolveModel } from '@/ai/providers';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { isVisualCrux } from '@/services/verify';
import { setVerifyOnDone } from '@/services/turns';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ModelSelector from './ModelSelector';
import ModelInfoPanel from './ModelInfoPanel';
import TurnJobCard from './TurnJobCard';

/**
 * Verify before done (B4), the person's side: "Check it" runs the check now;
 * the switch decides whether a "done" claim runs it automatically. Only shown
 * where a check can happen — a visual crux on a platform that can screenshot.
 */
function CheckControls({ busy }: { busy: boolean }) {
  const visual = useCruxStore((s) => isVisualCrux(s.artifacts));
  const auto = useCruxStore((s) => s.crux?.meta?.settings?.verifyOnDone !== false);
  const { check } = useChat();
  if (!visual || !can(Capability.PreviewServer)) return null;
  const btn =
    'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)] border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-1.5 shrink-0" data-testid="check-controls">
      <button
        type="button"
        onClick={() => void setVerifyOnDone(!auto)}
        role="switch"
        aria-checked={auto}
        title={auto ? 'Checks run when a turn says it is done' : 'Checks run only when you ask'}
        className={cn(
          btn,
          auto
            ? 'text-accent border-accent/40 hover:border-accent/70'
            : 'text-text-muted border-border hover:text-text hover:border-accent/50',
        )}
      >
        Check automatically{auto ? ' ✓' : ''}
      </button>
      <button
        type="button"
        onClick={check}
        disabled={busy}
        title="Build, screenshot and inspect the current state"
        className={cn(btn, 'text-text-muted hover:text-text border-border hover:border-accent/50')}
      >
        Check it
      </button>
    </div>
  );
}

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
          <div className="px-3 pb-1.5 flex justify-end empty:hidden">
            <CheckControls busy={isStreaming || isJobRunning} />
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
