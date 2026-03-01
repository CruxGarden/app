import { cn } from '@/lib/cn';
import { isPreviewable } from '@/lib/monacoLanguages';
import type { EditorTab, EditorViewMode } from '@/stores/uiStore';

interface EditorToolbarProps {
  tab: EditorTab;
  hasContent: boolean;
  onViewModeChange: (mode: EditorViewMode) => void;
  onSave?: () => void;
}

export default function EditorToolbar({
  tab,
  hasContent,
  onViewModeChange,
  onSave,
}: EditorToolbarProps) {
  const canPreview = isPreviewable(tab.path) && hasContent;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border gap-2 shrink-0">
      {/* Breadcrumb */}
      <span className="text-xs font-mono text-text-muted truncate flex-1">{tab.path}</span>

      <div className="flex items-center gap-2 shrink-0">
        {/* Save button */}
        {tab.dirty && onSave && (
          <button
            onClick={onSave}
            className="px-2 py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] bg-accent text-bg hover:brightness-110 transition-colors cursor-pointer"
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
