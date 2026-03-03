import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Crux, CruxSummary, CruxVisibility, Attachment, ChatMessage } from '@/api/types';

// ── Helpers ──────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
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
  unlisted: 'bg-accent-muted text-text-muted',
  private: 'bg-error-muted text-error',
};

// ── Field Components ─────────────────────────────────

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
        {label}
      </span>
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
    const inputClass =
      'w-full px-1 py-0.5 text-xs font-mono bg-bg border border-accent rounded-[var(--radius-sm)] text-text outline-none';
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
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="text-left hover:text-accent transition-colors cursor-pointer w-full flex items-start gap-1.5 group"
        title="Click to edit"
      >
        <span className="truncate flex-1">
          {value || <span className="text-text-muted italic">empty</span>}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-muted shrink-0 mt-0.5"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </FieldRow>
  );
}

// ── Readonly field — just displays the value ─────────

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <FieldRow label={label}>
      <span className="whitespace-pre-wrap">{value || <span className="text-text-muted italic">empty</span>}</span>
    </FieldRow>
  );
}

// ── Main Content ─────────────────────────────────────

interface MetadataContentProps {
  crux: Crux;
  summary?: CruxSummary | null;
  selectedArtifact?: Attachment | null;
  authorName?: string;
  messages?: ChatMessage[];
  readOnly?: boolean;
  onUpdate?: (fields: Record<string, unknown>) => void;
}

function formatModel(model: string): string {
  const map: Record<string, string> = {
    'claude-sonnet-4-20250514': 'Claude Sonnet 4',
    'claude-opus-4-20250514': 'Claude Opus 4',
    'claude-haiku-3-5-20241022': 'Claude Haiku 3.5',
    'claude-3-5-sonnet-20241022': 'Claude Sonnet 3.5',
  };
  return map[model] || model;
}

export default function MetadataContent({
  crux,
  summary,
  selectedArtifact,
  authorName,
  messages,
  readOnly,
  onUpdate,
}: MetadataContentProps) {
  const collaborators = useMemo(() => {
    if (!messages?.length) return [];
    const models = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.model) models.add(msg.model);
    }
    // Fall back to crux settings model if no per-message model found
    if (models.size === 0 && crux.meta?.settings?.model) {
      models.add(crux.meta.settings.model);
    }
    return Array.from(models);
  }, [messages, crux.meta?.settings?.model]);

  const cycleVisibility = () => {
    if (readOnly || !onUpdate) return;
    const idx = VISIBILITY_ORDER.indexOf(crux.visibility);
    const next = VISIBILITY_ORDER[(idx + 1) % VISIBILITY_ORDER.length]!;
    onUpdate({ visibility: next });
  };


  const Field = readOnly
    ? ({ label, value }: { label: string; value: string; multiline?: boolean }) => (
        <ReadonlyField label={label} value={value} />
      )
    : ({
        label,
        value,
        multiline,
      }: {
        label: string;
        value: string;
        multiline?: boolean;
      }) => (
        <EditableField
          label={label}
          value={value}
          onSave={(v) => onUpdate?.({ [label.toLowerCase()]: v })}
          multiline={multiline}
        />
      );

  return (
    <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
      {/* ── Crux Metadata ── */}
      <div className="flex flex-col gap-3">
        <Field label="Title" value={crux.title ?? ''} />
        <Field label="Description" value={crux.description ?? ''} multiline />
      </div>

      {/* ── Contributors ── */}
      {(authorName || collaborators.length > 0) && (
        <>
          <div className="border-t border-border" />
          <div className="flex flex-col gap-2">
            {authorName && (
              <FieldRow label="Author">
                <span>{authorName}</span>
              </FieldRow>
            )}
            {collaborators.length > 0 && (
              <FieldRow label="Collaborators">
                {collaborators.map((model) => (
                  <span key={model}>{formatModel(model)}</span>
                ))}
              </FieldRow>
            )}
          </div>
        </>
      )}

      {/* ── Details ── */}
      <div className="border-t border-border" />
      <div className="flex flex-col gap-3">
        <Field label="Slug" value={crux.slug} />

        <FieldRow label="Visibility">
          {readOnly ? (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase inline-block bg-text-muted/15 text-text-muted"
            >
              {crux.visibility}
            </span>
          ) : (
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
          )}
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
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              AI Summary
            </span>
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
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Selected File
            </span>
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
            <FieldRow label="Updated">
              <span>{formatDate(selectedArtifact.updated)}</span>
            </FieldRow>
          </div>
        </>
      )}
    </div>
  );
}
