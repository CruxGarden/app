import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import type { CruxVisibility, CruxStatus } from '@/api/types';
import PaneHeader from './PaneHeader';

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
        className="text-left hover:text-accent transition-colors cursor-pointer w-full truncate"
        title="Click to edit"
      >
        {value || <span className="text-text-muted italic">empty</span>}
      </button>
    </FieldRow>
  );
}

// ── Main Component ───────────────────────────────────

export default function MetadataPane() {
  const crux = useCruxStore((s) => s.crux);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const summary = useCruxStore((s) => s.summary);
  const gateCount = useCruxStore((s) => s.gateCount);
  const artifacts = useCruxStore((s) => s.artifacts);
  const activeTabId = useUIStore((s) => s.editor.activeTabId);
  const [copied, setCopied] = useState(false);

  const selectedArtifact = activeTabId
    ? artifacts.find((a) => a.id === activeTabId)
    : null;

  const handleCopySlug = () => {
    if (!crux) return;
    navigator.clipboard.writeText(crux.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
        <PaneHeader paneType="metadata" icon={<InfoIcon />} label="Details" />
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <p className="text-xs">No crux loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="metadata" icon={<InfoIcon />} label="Details" />

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

          <FieldRow label="Slug">
            <div className="flex items-center gap-1">
              <span className="truncate">{crux.slug}</span>
              <button
                onClick={handleCopySlug}
                className="shrink-0 p-0.5 text-text-muted hover:text-text transition-colors cursor-pointer"
                title="Copy slug"
              >
                {copied ? (
                  <span className="text-[10px] text-accent">copied</span>
                ) : (
                  <CopyIcon />
                )}
              </button>
            </div>
          </FieldRow>

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

          <FieldRow label="Gates">
            <span>{gateCount}</span>
          </FieldRow>

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
