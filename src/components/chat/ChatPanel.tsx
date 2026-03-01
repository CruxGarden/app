import { useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { useCruxStore } from '@/stores/cruxStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ModelSelector from './ModelSelector';

export default function ChatPanel() {
  const { messages, isStreaming, streamingContent, send, stop } = useChat();
  const model = useCruxStore((s) => s.crux?.meta?.settings?.model || 'claude-sonnet-4-20250514');
  const setModel = useCruxStore((s) => s.setModel);

  // User message history in reverse order (most recent first) for arrow-up recall
  const history = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .reverse(),
    [messages],
  );

  return (
    <div className="flex flex-col h-full">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />
      <div className="border-t border-border">
        <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
        <MessageInput onSend={send} onStop={stop} isStreaming={isStreaming} history={history} />
      </div>
    </div>
  );
}
