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
      setValue(next < 0 ? savedInputRef.current : history[next] ?? '');
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="p-3 bg-surface/30">
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
            'flex-1 resize-none bg-bg border border-accent/20 rounded-[var(--radius-sm)] px-3 py-2',
            'text-sm text-text placeholder:text-text-muted leading-[1.35]',
            'focus:outline-none focus:border-accent',
            'font-body',
            'max-h-[200px]',
          )}
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className={cn(
              'px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
              'bg-error-muted text-error border border-error/20',
              'hover:bg-error/20 transition-colors cursor-pointer',
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
              'bg-accent-muted text-accent border border-accent/20',
              'hover:border-accent transition-colors cursor-pointer',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            Send
          </button>
        )}
      </div>
      <p className="text-[11px] text-text-muted mt-1.5 px-1">
        Enter to send · Shift+Enter for new line · ↑ for history
      </p>
    </div>
  );
}
