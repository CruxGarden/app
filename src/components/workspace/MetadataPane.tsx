import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import type { CruxVisibility, CruxStatus } from '@/api/types';
import PaneHeader from './PaneHeader';

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const VISIBILITY_ORDER: CruxVisibility[] = ['public', 'unlisted', 'private'];
const VISIBILITY_COLORS: Record<CruxVisibility, string> = {
  public: 'bg-accent/20 text-accent',
  unlisted: 'bg-yellow-500/20 text-yellow-400',
  private: 'bg-red-500/20 text-red-400',
};

// ── Field Components ─────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{label}</span>
      <div className="text-xs font-mono text-text">{children}</div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  multiline,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) {
      onSave(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    const inputClass = 'w-full px-1 py-0.5 text-xs font-mono bg-bg border border-accent rounded-[var(--radius-sm)] text-text outline-none';
    return (
      <FieldRow label={label}>
        {multiline ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(value);
                setEditing(false);
              }
            }}
            className={cn(inputClass, 'resize-none min-h-[60px]')}
            rows={3}
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className={inputClass}
          />
        )}
      </FieldRow>
    );
  }

  return (
    <FieldRow label={label}>
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-left hover:text-accent transition-colors cursor-pointer w-full flex items-start gap-1.5 group"
        title="Click to edit"
      >
        <span className="truncate flex-1">
          {value || <span className="text-text-muted italic">empty</span>}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0 mt-0.5">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </FieldRow>
  );
}

// ── Main Component ───────────────────────────────────

export default function MetadataPane() {
  const crux = useCruxStore((s) => s.crux);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const summary = useCruxStore((s) => s.summary);
  const artifacts = useCruxStore((s) => s.artifacts);
  const activeTabId = useUIStore((s) => s.editor.activeTabId);

  const selectedArtifact = activeTabId
    ? artifacts.find((a) => a.id === activeTabId)
    : null;

  const cycleVisibility = () => {
    if (!crux) return;
    const idx = VISIBILITY_ORDER.indexOf(crux.visibility);
    const next = VISIBILITY_ORDER[(idx + 1) % VISIBILITY_ORDER.length]!;
    updateCrux({ visibility: next });
  };

  const toggleStatus = () => {
    if (!crux) return;
    const next: CruxStatus = crux.status === 'living' ? 'frozen' : 'living';
    updateCrux({ status: next });
  };

  if (!crux) {
    return (
      <div className="flex flex-col h-full">
        <PaneHeader paneType="details" icon={<TagIcon />} label="Metadata" />
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">No crux loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="details" icon={<TagIcon />} label="Metadata" />

      <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
        {/* ── Crux Metadata ── */}
        <div className="flex flex-col gap-3">
          <EditableField
            label="Title"
            value={crux.title ?? ''}
            onSave={(title) => updateCrux({ title })}
          />

          <EditableField
            label="Description"
            value={crux.description ?? ''}
            onSave={(description) => updateCrux({ description })}
            multiline
          />

          <EditableField
            label="Slug"
            value={crux.slug}
            onSave={(slug) => updateCrux({ slug })}
          />

          <FieldRow label="Visibility">
            <button
              onClick={cycleVisibility}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-mono uppercase cursor-pointer transition-colors',
                VISIBILITY_COLORS[crux.visibility],
              )}
              title="Click to change"
            >
              {crux.visibility}
            </button>
          </FieldRow>

          <FieldRow label="Status">
            <button
              onClick={toggleStatus}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-mono uppercase cursor-pointer transition-colors',
                crux.status === 'living'
                  ? 'bg-accent/20 text-accent'
                  : 'bg-surface text-text-muted',
              )}
              title="Click to toggle"
            >
              {crux.status}
            </button>
          </FieldRow>

          {crux.meta?.settings?.model && (
            <FieldRow label="Model">
              <span className="truncate">{crux.meta.settings.model}</span>
            </FieldRow>
          )}

          <FieldRow label="Created">
            <span>{formatDate(crux.created)}</span>
          </FieldRow>

          <FieldRow label="Updated">
            <span>{formatDate(crux.updated)}</span>
          </FieldRow>
        </div>

        {/* ── AI Summary ── */}
        {summary && (
          <>
            <div className="border-t border-border" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">AI Summary</span>
              {summary.purpose && (
                <FieldRow label="Purpose">
                  <span className="whitespace-pre-wrap">{summary.purpose}</span>
                </FieldRow>
              )}
              {summary.stage && (
                <FieldRow label="Stage">
                  <span>{summary.stage}</span>
                </FieldRow>
              )}
              {summary.stack && (
                <FieldRow label="Stack">
                  <span>{summary.stack}</span>
                </FieldRow>
              )}
            </div>
          </>
        )}

        {/* ── Selected File Metadata ── */}
        {selectedArtifact && (
          <>
            <div className="border-t border-border" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Selected File</span>
              <FieldRow label="Filename">
                <span className="truncate">{selectedArtifact.filename}</span>
              </FieldRow>
              {selectedArtifact.meta?.path && (
                <FieldRow label="Path">
                  <span className="truncate">{selectedArtifact.meta.path as string}</span>
                </FieldRow>
              )}
              <FieldRow label="Size">
                <span>{formatSize(selectedArtifact.size)}</span>
              </FieldRow>
              <FieldRow label="Type">
                <span>{selectedArtifact.mimeType}</span>
              </FieldRow>
              <FieldRow label="Created">
                <span>{formatDate(selectedArtifact.created)}</span>
              </FieldRow>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
