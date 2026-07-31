import { useMemo, useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { Crux, CruxSummary, CruxKind, CruxVisibility, ChatMessage } from '@/api/types';

// ── Helpers ──────────────────────────────────────────

const VISIBILITY_ORDER: CruxVisibility[] = ['public', 'unlisted', 'private'];
const VISIBILITY_COLORS: Record<CruxVisibility, string> = {
  public: 'bg-accent/20 text-accent',
  unlisted: 'bg-accent-muted text-text-muted',
  private: 'bg-error-muted text-error',
};

const KIND_OPTIONS: (CruxKind | undefined)[] = [undefined, 'webapp', 'page', 'document', 'image'];
const KIND_LABELS: Record<string, string> = {
  webapp: 'Web App',
  page: 'Page',
  document: 'Document',
  image: 'Image',
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

// ── Tag Input ────────────────────────────────────────

function toKebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function TagInput({
  tags,
  onChange,
  readOnly,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback(
    (raw: string) => {
      const tag = toKebab(raw);
      if (!tag || tag.length > 50 || tags.includes(tag)) return;
      onChange([...tags, tag]);
    },
    [tags, onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(tags.filter((t) => t !== tag));
    },
    [tags, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]!);
    }
  };

  return (
    <FieldRow label="Tags">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono',
              'bg-accent/15 text-accent',
            )}
          >
            {tag}
            {!readOnly && (
              <button
                onClick={() => removeTag(tag)}
                className="hover:text-error transition-colors cursor-pointer ml-0.5"
              >
                &times;
              </button>
            )}
          </span>
        ))}
        {!readOnly && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (input.trim()) {
                addTag(input);
                setInput('');
              }
            }}
            placeholder={tags.length === 0 ? 'add tags...' : ''}
            className="bg-transparent text-xs font-mono text-text outline-none min-w-[60px] flex-1 py-0.5 placeholder:text-text-muted/50"
          />
        )}
      </div>
    </FieldRow>
  );
}

// ── Main Content ─────────────────────────────────────

interface MetadataContentProps {
  crux: Crux;
  summary?: CruxSummary | null;
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

  const cycleKind = () => {
    if (readOnly || !onUpdate) return;
    const current = crux.kind || undefined; // normalize null to undefined
    const idx = KIND_OPTIONS.indexOf(current as CruxKind | undefined);
    const next = KIND_OPTIONS[((idx === -1 ? 0 : idx) + 1) % KIND_OPTIONS.length];
    onUpdate({ kind: next ?? null });
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
        <TagInput
          tags={(crux.meta?.tags as string[]) || []}
          onChange={(tags) => onUpdate?.({ meta: { tags } })}
          readOnly={readOnly}
        />
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

        <FieldRow label="Type">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase inline-block bg-text-muted/15 text-text-muted">
            {crux.type || 'text'}
          </span>
        </FieldRow>

        <FieldRow label="Kind">
          {readOnly ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase inline-block bg-text-muted/15 text-text-muted">
              {crux.kind ? KIND_LABELS[crux.kind] || crux.kind : 'auto'}
            </span>
          ) : (
            <button
              onClick={cycleKind}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-mono uppercase cursor-pointer transition-colors',
                crux.kind ? 'bg-accent/20 text-accent' : 'bg-text-muted/15 text-text-muted',
              )}
              title="Click to change"
            >
              {crux.kind ? KIND_LABELS[crux.kind] || crux.kind : 'auto'}
            </button>
          )}
        </FieldRow>

        <FieldRow label="Created">
          <span>{formatDateTime(crux.created)}</span>
        </FieldRow>

        <FieldRow label="Updated">
          <span>{formatDateTime(crux.updated)}</span>
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

    </div>
  );
}
