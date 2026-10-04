import { useWorkspaceUIStore, useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { useRef, useCallback, useEffect, useState } from 'react';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import { confirmDialog } from '@/stores/dialogStore';
import { reportFileUpdateError } from '@/components/artifacts/fileUpdateError';
import { linkClass } from '@/components/ui/button-class';

interface MessageInputProps {
  /** Send — or, while a Background Turn runs, queue behind it. */
  onSend: (content: string) => void;
  onStop?: () => void;
  /** Stop the running turn and send this message at once. */
  onSteer?: (content: string) => void;
  /** A turn is in flight: the composer stays live, Enter queues, Steer redirects. */
  isStreaming: boolean;
  disabled?: boolean;
  history?: string[];
}

export default function MessageInput({
  onSend,
  onStop,
  onSteer,
  isStreaming,
  disabled,
  history = [],
}: MessageInputProps) {
  const ui = useWorkspaceUIStoreApi();
  const store = useCruxStoreApi();
  const uploadFiles = useCruxStore((s) => s.uploadFiles);
  const uploadProgress = useCruxStore((s) => s.uploadProgress);
  const [addingFiles, setAddingFiles] = useState(false);
  const [fileNotice, setFileNotice] = useState('');
  const addingRef = useRef(false);
  const cruxId = useCruxStore((s) => s.crux?.id);
  const pasteAsArtifact = useCruxStore((s) => s.pasteAsArtifact);
  const fileRef = useRef<HTMLInputElement>(null);
  const value = useWorkspaceUIStore((s) => s.composerDraft);
  const setValue = useWorkspaceUIStore((s) => s.setComposerDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyIndexRef = useRef(ui.getState().composerHistoryIndex);
  const savedInputRef = useRef(ui.getState().composerHistoryDraft);
  useEffect(
    () => () => {
      ui.setState({
        composerHistoryIndex: historyIndexRef.current,
        composerHistoryDraft: savedInputRef.current,
      });
    },
    [ui],
  );

  const focusedDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!cruxId || !value.trim() || history.length || focusedDraft.current === cruxId) return;
    // The saved idea arrives after mount; wait until modal cleanup has restored focus.
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
      focusedDraft.current = cruxId;
    });
    return () => cancelAnimationFrame(frame);
  }, [cruxId, value, history.length]);

  // Builder actions can hand the user to the AI mid-sentence

  const clear = useCallback(() => {
    setValue('');
    historyIndexRef.current = -1;
    savedInputRef.current = '';
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [setValue]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || addingRef.current) return;
    onSend(trimmed);
    clear();
  }, [value, disabled, onSend, clear]);

  const handleSteer = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || addingRef.current || !onSteer) return;
    onSteer(trimmed);
    clear();
  }, [value, disabled, onSteer, clear]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter can commit an IME candidate; it must not send or recall history.
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
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

  // A long paste becomes a file (MAKING-THE-AD-PARITY gap 8): a brief in the
  // composer was a wall of raw markdown in the person's pill; as a file the
  // collaborator reads it, Growth keeps it, and the message stays a sentence.
  const PASTE_AS_FILE_CHARS = 1500;
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!cruxId || text.length < PASTE_AS_FILE_CHARS || disabled) return;
    e.preventDefault();
    void pasteAsArtifact(text);
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const addFiles = async (files: File[]) => {
    if (!files.length || addingRef.current) return;
    addingRef.current = true;
    setAddingFiles(true);
    setFileNotice('');
    const ownerId = store.getState().crux?.id;
    try {
      const current = store.getState().artifacts;
      const selection = files.map((file) => ({
        file,
        path: file.name,
        expected: structuredClone(
          current.find((item) => (item.meta?.path || item.filename) === file.name) ?? null,
        ),
      }));
      const conflicts = selection.filter((entry) => entry.expected !== null);
      if (
        conflicts.length &&
        !(await confirmDialog({
          message:
            conflicts.length === 1
              ? `"${conflicts[0]!.path}" already exists. Replace it?`
              : `${conflicts.length} files already exist. Replace them?`,
          confirmLabel: 'Replace',
        }))
      )
        return;
      if (!ownerId || store.getState().crux?.id !== ownerId)
        throw new Error('The active Crux changed. Choose the files again in their destination.');
      await uploadFiles(selection);
      setFileNotice(
        `Added ${files.length === 1 ? '1 file' : `${files.length} files`} to Artifacts.`,
      );
    } catch (error) {
      await reportFileUpdateError(store, error, {
        title: 'Could not add files',
        fallback: 'Could not add these files. Choose them again to retry.',
      });
    } finally {
      addingRef.current = false;
      setAddingFiles(false);
      const input = textareaRef.current;
      if (input?.getClientRects().length && !input.closest('[inert]')) input.focus();
    }
  };

  const round =
    'w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed';
  const pill = 'px-3 h-8 shrink-0 rounded-full text-xs font-body transition-colors cursor-pointer';

  // The composer is a pill: add a file on the left, the words in the middle,
  // Send (or Stop, Steer, Queue while a turn runs) on the right. The model
  // chip and the check controls sit beneath it in the panel.
  return (
    <div className="px-3 pb-2 pt-2 bg-chat-composer">
      {(addingFiles || fileNotice) && (
        <div
          role="status"
          className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-chat-text-muted"
        >
          <span>
            {addingFiles
              ? uploadProgress
                ? `Adding ${uploadProgress.completed + 1} of ${uploadProgress.total}: ${uploadProgress.currentFile}`
                : 'Preparing files…'
              : fileNotice}
          </span>
          {!addingFiles && (
            <button
              type="button"
              className={linkClass()}
              onClick={() => ui.getState().setPaneVisible('artifacts', true)}
            >
              Show files
            </button>
          )}
        </div>
      )}
      {history.length === 0 && !isStreaming && value.trim() && (
        <p className="text-xs text-text-muted mb-2">
          Your idea is ready. Press Enter or choose Send to start with AI.
        </p>
      )}
      <div
        className={cn(
          'flex items-end gap-1.5 rounded-[22px] border px-2 py-1.5',
          'bg-chat-input border-chat-input-border focus-within:border-chat-input-border-focus transition-colors',
        )}
        data-testid="composer"
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void addFiles(files);
          }}
        />
        <button
          type="button"
          aria-label="Add a file"
          title="Add a file to Artifacts"
          disabled={disabled || addingFiles}
          onClick={() => fileRef.current?.click()}
          className={cn(round, 'text-chat-text-muted hover:text-text hover:bg-surface-hover')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={(e) => void handlePaste(e)}
          placeholder="Send a message..."
          rows={1}
          disabled={disabled}
          className={cn(
            'flex-1 min-w-0 resize-none bg-transparent border-0 px-1 py-1.5',
            'text-sm text-chat-input-text placeholder:text-chat-input-placeholder leading-[1.4]',
            'focus:outline-none font-body max-h-[200px]',
          )}
        />
        {isStreaming ? (
          <>
            {value.trim() && onSteer && (
              <button
                onClick={handleSteer}
                disabled={disabled || addingFiles}
                title="Stop the current turn and send this now"
                className={cn(
                  pill,
                  'bg-action-button text-action-button-text border border-action-button-border hover:bg-action-button-hover',
                )}
              >
                Steer
              </button>
            )}
            {value.trim() && (
              <button
                onClick={handleSubmit}
                disabled={disabled || addingFiles}
                title="Send after the current turn finishes"
                className={cn(
                  pill,
                  'bg-chat-send-button text-chat-send-button-icon border border-chat-send-button/(--tint-subtle) hover:bg-chat-send-button-hover motion-press react-accent',
                )}
              >
                Queue
              </button>
            )}
            <button
              onClick={onStop}
              aria-label="Stop"
              title="Stop this turn"
              className={cn(
                round,
                'bg-danger-button text-on-error border border-danger-button-border hover:bg-danger-button-hover',
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled || addingFiles}
            aria-label="Send"
            title="Send (Enter)"
            className={cn(
              round,
              'bg-chat-send-button text-chat-send-button-icon border border-chat-send-button/(--tint-subtle)',
              'hover:bg-chat-send-button-hover motion-press react-accent ',
            )}
          >
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
          </button>
        )}
      </div>
      {isStreaming && (
        <p className="text-xxs text-chat-text-muted/(--tint-strong) mt-1.5 px-2">
          Enter to queue after this turn · Steer stops it and sends now
        </p>
      )}
    </div>
  );
}
