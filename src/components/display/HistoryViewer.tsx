import type { ChatMessage, CruxSummary, ToolCall } from '@/api/types';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';

interface HistoryViewerProps {
  messages?: ChatMessage[];
  summary?: CruxSummary | null;
  onClose: () => void;
}

function toolCallLabel(tc: ToolCall): string {
  const path = tc.input?.path as string | undefined;
  switch (tc.name) {
    case 'write_file':
      return `Wrote ${path || 'file'}`;
    case 'read_file':
      return `Read ${path || 'file'}`;
    case 'list_files':
      return 'Listed files';
    case 'set_palette':
      return 'Applied palette';
    default:
      return tc.name;
  }
}

export default function HistoryViewer({ messages, summary, onClose }: HistoryViewerProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-mono uppercase tracking-wider">Conversation</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary card */}
        {summary && (
          <div className="p-3 rounded-[var(--radius-sm)] bg-accent-muted/30 border border-accent-muted">
            <p className="text-xs font-mono text-accent mb-1 font-medium">{summary.crux}</p>
            <p className="text-sm text-text leading-relaxed">{summary.purpose}</p>
            {summary.stack && (
              <p className="text-xs text-text-muted mt-2">{summary.stack}</p>
            )}
          </div>
        )}

        {/* Messages */}
        {messages && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <div className="ml-6 bg-accent-muted/20 rounded-[var(--radius-sm)] p-3">
                    <span className="text-[10px] font-mono text-accent/60 uppercase block mb-1">
                      you
                    </span>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                      {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                    </p>
                  </div>
                ) : (
                  <div className="mr-4 bg-surface/50 rounded-[var(--radius-sm)] p-3">
                    <span className="text-[10px] font-mono text-text-muted uppercase block mb-1">
                      assistant
                    </span>
                    <div className="text-sm text-text leading-relaxed prose-sm">
                      <MarkdownRenderer
                        content={
                          typeof msg.content === 'string'
                            ? msg.content
                            : JSON.stringify(msg.content)
                        }
                      />
                    </div>
                    {/* Tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.toolCalls.map((tc, j) => (
                          <div
                            key={tc.id || j}
                            className="text-xs font-mono text-text-muted bg-bg rounded px-2 py-1"
                          >
                            {toolCallLabel(tc)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            No conversation available for this creation.
          </p>
        )}
      </div>
    </div>
  );
}
