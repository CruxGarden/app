import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/cn';

interface MessageInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  history?: string[];
}

export default function MessageInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  history = [],
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  // Builder actions can hand the user to the AI mid-sentence

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue('');
    historyIndexRef.current = -1;
    savedInputRef.current = '';

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      handleSubmit();
    }

    if (e.key === 'ArrowUp' && history.length > 0) {
      const el = textareaRef.current;
      if (el && (el.selectionStart === 0 || !value.includes('\n'))) {
        e.preventDefault();
        if (historyIndexRef.current === -1) {
          savedInputRef.current = value;
        }
        const next = Math.min(historyIndexRef.current + 1, history.length - 1);
        historyIndexRef.current = next;
        setValue(history[next] ?? '');
      }
    }

    if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      e.preventDefault();
      const next = historyIndexRef.current - 1;
      historyIndexRef.current = next;
      setValue(next < 0 ? savedInputRef.current : (history[next] ?? ''));
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="p-3 bg-chat-composer">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Send a message..."
          rows={1}
          disabled={disabled}
          className={cn(
            'flex-1 resize-none bg-chat-input border border-chat-input-border rounded-[var(--radius-sm)] px-3 py-2',
            'text-sm text-chat-input-text placeholder:text-chat-input-placeholder leading-[1.35]',
            'focus:outline-none focus:border-chat-input-border-focus',
            'font-body',
            'max-h-[200px]',
          )}
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className={cn(
              'px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
              'bg-danger-button text-on-error border border-danger-button-border',
              'hover:bg-danger-button-hover transition-colors cursor-pointer',
            )}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className={cn(
              'px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
              'bg-chat-send-button text-chat-send-button-icon border border-chat-send-button/20',
              'hover:bg-chat-send-button-hover transition-colors cursor-pointer',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            Send
          </button>
        )}
      </div>
      <p className="text-xxs text-chat-text-muted mt-1.5 px-1">
        Enter to send · Shift+Enter for new line · ↑ for history
      </p>
    </div>
  );
}
