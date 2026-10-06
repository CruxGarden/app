import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Modal, SectionLabel } from '@/components/ui';
import { rowClass } from '@/components/ui/button-class';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { isAgentFile } from '@/lib/artifact-path';
import { formatBytes } from '@/lib/format';
import { useCruxStore } from '@/stores/cruxStore';
import {
  changeView,
  compareFileLists,
  compareFilesOf,
  countChanges,
  readCompareText,
  type CompareFile,
  type FileChange,
  type FileChangeStatus,
} from '@/services/version-compare';

const TextDiff = lazy(() => import('./TextDiff'));

/** A saved state to hold against the current files: its name and how to list it. */
export interface CompareSource {
  title: string;
  load: () => Promise<CompareFile[]>;
}

const GROUPS: { status: FileChangeStatus; label: string }[] = [
  { status: 'changed', label: 'Changed' },
  { status: 'added', label: 'Added' },
  { status: 'removed', label: 'Removed' },
];

function summary(changes: readonly FileChange[]): string {
  const counts = countChanges(changes);
  return GROUPS.filter((group) => counts[group.status])
    .map((group) => `${counts[group.status]} ${group.label.toLowerCase()}`)
    .join(' · ');
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-auto max-w-[44ch] p-6 text-center text-sm text-text-muted" role="status">
      {children}
    </p>
  );
}

function Picture({ file, label }: { file?: CompareFile; label: string }) {
  const url = useBlobUrl(file?.fingerprint, file?.mimeType);
  return (
    <figure className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <SectionLabel as="figcaption" tone="muted">
        {label}
        {file ? ` · ${formatBytes(file.size)}` : ''}
      </SectionLabel>
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-preview-bg p-2">
        {!file ? (
          <span className="text-xs text-text-muted">Not present</span>
        ) : url ? (
          <img
            src={url}
            alt={`${label}: ${file.path}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-text-muted">Loading…</span>
        )}
      </div>
    </figure>
  );
}

function TextChange({ change, savedLabel }: { change: FileChange; savedLabel: string }) {
  const [sides, setSides] = useState<{ original: string; modified: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setSides(null);
    setError('');
    void Promise.all([readCompareText(change.before), readCompareText(change.after)])
      .then(([original, modified]) => {
        if (live) setSides({ original, modified });
      })
      .catch((err: Error) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [change]);
  if (error)
    return (
      <p role="alert" className="p-4 text-sm text-error">
        {error}
      </p>
    );
  if (!sides) return <Note>Loading…</Note>;
  return (
    <>
      <div className="flex shrink-0 justify-between gap-3 border-b border-border px-3 py-1.5">
        <SectionLabel tone="muted">{savedLabel}</SectionLabel>
        <SectionLabel tone="muted">Current</SectionLabel>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<Note>Loading…</Note>}>
          <TextDiff original={sides.original} modified={sides.modified} path={change.path} />
        </Suspense>
      </div>
    </>
  );
}

function ChangeDetail({ change, savedLabel }: { change: FileChange; savedLabel: string }) {
  const view = changeView(change);
  if (view === 'text') return <TextChange change={change} savedLabel={savedLabel} />;
  if (view === 'image')
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:flex-row">
        <Picture file={change.before} label={savedLabel} />
        <Picture file={change.after} label="Current" />
      </div>
    );
  const fact =
    change.status === 'added'
      ? 'This file was added.'
      : change.status === 'removed'
        ? 'This file was removed.'
        : 'This file changed.';
  return (
    <Note>
      {fact}{' '}
      {view === 'too-large'
        ? 'It is over 1 MB, so its text is not compared here.'
        : 'It is not text, so there is no line-by-line comparison.'}
    </Note>
  );
}

/**
 * "Compare with current": what was added, removed and changed between a saved
 * state and the files as they are now, with a text comparison for the file
 * picked. Read-only; it works the same in Main and inside a Task.
 */
export default function CompareVersions({
  source,
  onClose,
}: {
  source: CompareSource;
  onClose: () => void;
}) {
  // While a version is being viewed the store's files are that version's; the
  // stashed Working Copy files are still "current".
  const artifacts = useCruxStore((s) => s.workspaceArtifacts ?? s.artifacts);
  const aiEnabled = useAiEnabled();
  const [saved, setSaved] = useState<CompareFile[] | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSaved(null);
    setError('');
    void source
      .load()
      .then((files) => {
        if (live) setSaved(files);
      })
      .catch((err: Error) => {
        if (live) setError(err.message || 'Could not read this version.');
      });
    return () => {
      live = false;
    };
  }, [source]);

  const changes = useMemo(() => {
    if (!saved) return null;
    // With AI Tools off the agent guides stay out of view here too.
    const shown = (files: CompareFile[]) =>
      aiEnabled ? files : files.filter((file) => !isAgentFile(file.path));
    return compareFileLists(shown(saved), shown(compareFilesOf(artifacts)));
  }, [saved, artifacts, aiEnabled]);

  const selected =
    changes?.find((change) => change.path === picked) ??
    changes?.find((change) => change.status === 'changed') ??
    changes?.[0];

  return (
    <Modal
      open
      size="full"
      flush
      onClose={onClose}
      title="Compare with current"
      subtitle={changes?.length ? `${source.title} → current · ${summary(changes)}` : source.title}
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row" data-testid="compare-versions">
        {error ? (
          <p role="alert" className="p-4 text-sm text-error">
            {error}
          </p>
        ) : !changes ? (
          <Note>Comparing…</Note>
        ) : !changes.length ? (
          <Note>Nothing has changed since {source.title}.</Note>
        ) : (
          <>
            <nav
              aria-label="Changed files"
              className="max-h-44 shrink-0 overflow-y-auto border-b border-border p-2 md:max-h-none md:w-64 md:border-b-0 md:border-r"
            >
              {GROUPS.map((group) => {
                const rows = changes.filter((change) => change.status === group.status);
                if (!rows.length) return null;
                return (
                  <section key={group.status} data-status={group.status} className="mb-2">
                    <SectionLabel as="h3" tone="muted" className="px-3 py-1">
                      {group.label} · {rows.length}
                    </SectionLabel>
                    <ul>
                      {rows.map((change) => (
                        <li key={change.path}>
                          <button
                            type="button"
                            aria-current={selected === change ? 'true' : undefined}
                            onClick={() => setPicked(change.path)}
                            title={change.path}
                            className={rowClass(selected === change, 'py-1.5 text-xs font-mono')}
                          >
                            <span className="truncate">{change.path}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {selected && (
                <ChangeDetail key={selected.path} change={selected} savedLabel={source.title} />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
