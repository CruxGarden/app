import { cn } from '@/lib/cn';
import { isPreviewable } from '@/lib/monacoLanguages';
import type { EditorTab, EditorViewMode } from '@/stores/uiStore';

interface EditorToolbarProps {
  tab: EditorTab;
  hasContent: boolean;
  onViewModeChange: (mode: EditorViewMode) => void;
  onSave?: () => void;
  onCapture?: () => void;
  isCapturing?: boolean;
}

export default function EditorToolbar({
  tab,
  hasContent,
  onViewModeChange,
  onSave,
  onCapture,
  isCapturing,
}: EditorToolbarProps) {
  const canPreview = isPreviewable(tab.path) && hasContent;
  const inPreview = tab.viewMode === 'preview' && canPreview;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border gap-2 shrink-0">
      {/* Breadcrumb */}
      <span className="text-xs font-mono text-text-muted truncate flex-1">{tab.path}</span>

      <div className="flex items-center gap-2 shrink-0">
        {/* Capture thumbnail button — only in preview mode */}
        {inPreview && onCapture && (
          <button
            onClick={onCapture}
            disabled={isCapturing}
            title="Capture preview (saves as preview.jpg)"
            className={cn(
              'p-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              isCapturing
                ? 'text-accent animate-pulse'
                : 'text-text-muted hover:text-accent hover:bg-accent-muted',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        )}

        {/* Save button */}
        {tab.dirty && onSave && (
          <button
            onClick={onSave}
            className="px-2 py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-colors cursor-pointer"
          >
            Save
          </button>
        )}

        {/* View mode toggle */}
        {canPreview && (
          <div className="flex bg-bg rounded-[var(--radius-sm)] p-0.5">
            <ModeButton
              label="Source"
              active={tab.viewMode === 'source'}
              onClick={() => onViewModeChange('source')}
            />
            <ModeButton
              label="Preview"
              active={tab.viewMode === 'preview'}
              onClick={() => onViewModeChange('preview')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer',
        active ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text',
      )}
    >
      {label}
    </button>
  );
}
