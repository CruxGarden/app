import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { useWorkspaceRegistry, closeCruxWorkspaces } from '@/stores/workspaceRegistry';
import { choiceDialog } from '@/stores/dialogStore';
import { Capability, can } from '@/lib/platform';
import { Button, Modal } from '@/components/ui';
import { useStoreProxy } from '@/hooks/useStoreProxy';
import { getSetting, setSetting } from '@/services/settings';
import {
  listWorkingCopies,
  copyIdentity,
  TASKS_CHANGED,
  type WorkingCopy,
} from '@/services/working-copies';
import {
  createTask,
  recoverTaskSetup,
  prepareTaskReview,
  resolveTaskReview,
  verifyTaskReview,
  applyTaskReview,
  resumeTaskMerge,
  pendingTaskMerge,
  archiveTask,
  releaseTaskReview,
  type TaskReview,
} from '@/services/tasks';
import { sameTaskFile, type TaskFile } from '@/services/task-manifest';
import { getSqliteClient } from '@/services/sqlite/client';
import { documentsFor } from '@/services/workspace-documents';

function FileText({ file }: { file?: TaskFile }) {
  const [content, setContent] = useState('');
  useEffect(() => {
    let live = true;
    setContent('Loading…');
    const load = async () => {
      if (!file) return '(Absent)';
      if (file.encoding !== 'utf-8') return `Binary Artifact · ${file.fingerprint}`;
      const text = new TextDecoder().decode(await getSqliteClient().blobRead(file.fingerprint));
      return text.length > 30000 ? `${text.slice(0, 30000)}\n[Preview truncated]` : text;
    };
    void load()
      .then((text) => {
        if (live) setContent(text);
      })
      .catch((error) => {
        if (live) setContent((error as Error).message);
      });
    return () => {
      live = false;
    };
  }, [file]);
  return (
    <pre className="text-xs overflow-auto max-h-64 border border-border rounded p-2 whitespace-pre-wrap">
      {content}
    </pre>
  );
}
function ReviewDiff({ review }: { review: TaskReview }) {
  const paths = [...new Set([...Object.keys(review.main), ...Object.keys(review.manifest)])]
    .filter((path) => !sameTaskFile(review.main[path], review.manifest[path]))
    .sort();
  const [selected, setSelected] = useState('');
  const path = paths.includes(selected) ? selected : paths[0];
  if (!path) return <p>No source changes to merge.</p>;
  return (
    <div className="space-y-2">
      <label className="block">
        Changed Artifacts ({paths.length})
        <select
          aria-label="Review Artifact"
          className="block w-full mt-1 bg-surface border border-border rounded p-2"
          value={path}
          onChange={(e) => setSelected(e.target.value)}
        >
          {paths.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-text-muted">Main before merge</p>
          <FileText file={review.main[path]} />
        </div>
        <div>
          <p className="text-xs text-text-muted">Combined result</p>
          <FileText file={review.manifest[path]} />
        </div>
      </div>
    </div>
  );
}
function CombinedPreview({ review }: { review: TaskReview }) {
  useStoreProxy(review.candidateId);
  if (!review.previewUrl) return null;
  return (
    <iframe
      title="Combined task preview"
      data-crux-id={review.candidateId}
      src={review.previewUrl}
      className="w-full h-72 rounded border border-border bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
    />
  );
}
export default function TaskBar() {
  const crux = useCruxStore((s) => s.crux);
  const data = useCruxStoreApi();
  const ui = useWorkspaceUIStoreApi();
  const navigate = useNavigate();
  const entries = useWorkspaceRegistry((s) => s.entries);
  const identity = copyIdentity(crux);
  const mainId = identity?.cruxId ?? crux?.id;
  const [tasks, setTasks] = useState<WorkingCopy[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [limit, setLimit] = useState(
    () => Number(getSetting('cruxgarden:parallel-task-limit')) || 2,
  );
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<TaskReview | null>(null);
  const [pending, setPending] = useState<TaskReview | null>(null);
  const [inspected, setInspected] = useState(false);
  useEffect(() => {
    if (!mainId) return;
    let live = true;
    const refresh = () => {
      void Promise.all([listWorkingCopies(mainId), pendingTaskMerge(mainId)])
        .then(([rows, merge]) => {
          if (live) {
            setTasks(rows);
            setPending(merge);
          }
        })
        .catch((e) => {
          if (live) setError((e as Error).message);
        });
    };
    refresh();
    window.addEventListener(TASKS_CHANGED, refresh);
    return () => {
      live = false;
      window.removeEventListener(TASKS_CHANGED, refresh);
    };
  }, [mainId]);
  const reviewId = review?.id;
  useEffect(
    () => () => {
      if (reviewId) void releaseTaskReview(reviewId).catch(console.error);
    },
    [reviewId],
  );
  if (!crux || !mainId || !can(Capability.ProjectFolder)) return null;
  async function run(label: string, operation: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const current = tasks.find((t) => t.id === crux.id);
  const url = (id?: string) => (id ? `/c/${mainId}?task=${id}` : `/c/${mainId}`);
  return (
    <>
      <div className="shrink-0 px-3 py-2 border-b border-border space-y-2" data-testid="task-bar">
        <div className="flex items-center gap-2 flex-wrap" aria-label="Crux tasks">
          <Link
            aria-current={!identity ? 'page' : undefined}
            className={`px-3 py-1 rounded text-sm ${!identity ? 'bg-accent-muted text-accent' : 'text-text-muted'}`}
            to={url()}
          >
            Main
          </Link>
          {tasks.map((t) => (
            <Link
              key={t.id}
              to={url(t.id)}
              aria-current={crux.id === t.id ? 'page' : undefined}
              className={`px-3 py-1 rounded text-sm ${crux.id === t.id ? 'bg-accent-muted text-accent' : 'text-text-muted'}`}
            >
              {t.title}
              <span className="ml-2 text-xxs">
                {t.phase === 'ready'
                  ? (entries.find((e) => e.id === t.id)?.status ?? 'Ready')
                  : t.phase}
              </span>
            </Link>
          ))}
          <Button
            size="sm"
            variant="secondary"
            disabled={!!busy || !!pending}
            onClick={() => setCreating(true)}
          >
            New task
          </Button>
          {current?.phase === 'ready' && (
            <>
              <Button
                size="sm"
                disabled={!!busy || !!pending}
                onClick={() =>
                  void run('Preparing review…', async () => {
                    setInspected(false);
                    setReview(await prepareTaskReview(crux.id));
                  })
                }
              >
                Review changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() => void run('Archiving…', () => archiveTask(crux.id, true))}
              >
                Archive task
              </Button>
            </>
          )}
          {current?.phase === 'archived' && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() => void run('Reopening…', () => archiveTask(crux.id, false))}
            >
              Reopen task
            </Button>
          )}
          {current?.phase === 'merged' && (
            <span className="text-xs text-text-muted">
              Merged into Main. Start a new task for further changes.
            </span>
          )}
          {(current?.phase === 'failed' || current?.phase === 'preparing') && (
            <span className="text-xs text-text-muted">
              Task setup did not finish. Its captured files are kept.
            </span>
          )}
          {(current?.phase === 'failed' || current?.phase === 'preparing') && (
            <Button
              size="sm"
              disabled={!!busy}
              onClick={() => void run('Recovering task…', () => recoverTaskSetup(crux.id))}
            >
              Recover task setup
            </Button>
          )}
          {tasks.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy || !!pending}
              onClick={() =>
                void run('Closing Crux…', async () => {
                  const answer = await choiceDialog({
                    title: 'Close Crux',
                    message:
                      'Close Main and all of its task workspaces. Running turns will stop; files and history stay in your garden.',
                    choices: [
                      { id: 'cancel', label: 'Cancel', variant: 'ghost' },
                      {
                        id: 'discard',
                        label: 'Discard unsaved edits and close',
                        variant: 'secondary',
                      },
                      { id: 'save', label: 'Save and close' },
                    ],
                  });
                  if (answer.choice === 'save' || answer.choice === 'discard') {
                    await closeCruxWorkspaces(mainId, answer.choice);
                    navigate('/home');
                  }
                })
              }
            >
              Close Crux
            </Button>
          )}
        </div>
        {busy && (
          <p role="status" className="text-xs">
            {busy}
          </p>
        )}
        {pending && (
          <div role="alert" className="text-sm flex items-center gap-3">
            A merge was interrupted. Main is protected until it is recovered.
            <Button
              size="sm"
              disabled={!!busy}
              onClick={() =>
                void run('Recovering merge…', async () => {
                  await resumeTaskMerge(pending.id);
                  navigate(url());
                })
              }
            >
              Resume merge
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
      <Modal
        open={creating}
        onClose={() => {
          if (!busy) setCreating(false);
        }}
        title="New task"
        subtitle="Work independently, then review and merge into Main."
      >
        <form
          role="dialog"
          aria-label="New task"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run('Saving and preparing task…', async () => {
              await documentsFor(data, ui).saveAll();
              const task = await createTask(mainId, title, prompt);
              setCreating(false);
              setTitle('');
              setPrompt('');
              navigate(url(task.id));
            });
          }}
        >
          <label className="block text-sm">
            Task name
            <input
              aria-label="Task name"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block mt-1 w-full bg-surface border border-border rounded p-2"
              placeholder="Improve checkout"
            />
          </label>
          <label className="block text-sm">
            What should change?
            <textarea
              aria-label="Task description"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="block mt-1 w-full bg-surface border border-border rounded p-2"
              rows={3}
            />
          </label>
          <label className="block text-sm">
            Maximum simultaneous turns per Crux
            <select
              aria-label="Maximum simultaneous turns"
              className="ml-2 border border-border bg-surface rounded p-1"
              value={limit}
              onChange={(e) => {
                const n = Number(e.target.value);
                setLimit(n);
                setSetting('cruxgarden:parallel-task-limit', String(n));
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text-muted">
            Starts from Main’s saved Artifacts. Each task has its own Collaboration, preview and
            local Store. Agents start when you send a message.
          </p>
          {error && (
            <p role="alert" className="text-error text-sm">
              {error}
            </p>
          )}
          <Button type="submit" loading={!!busy}>
            Save and start task
          </Button>
        </form>
      </Modal>
      <Modal
        open={!!review}
        onClose={() => {
          if (!busy && review)
            void run('Closing review…', async () => {
              await releaseTaskReview(review.id);
              setReview(null);
            });
        }}
        size="xl"
        title="Review changes for Main"
        className="max-h-[90vh] overflow-auto"
      >
        {review && (
          <div role="dialog" aria-label="Review changes for Main" className="space-y-4 text-sm">
            <p>Compare the combined result with Main. Other tasks remain separate.</p>
            {review.conflicts.map((c) => (
              <div key={c.path} className="border border-border rounded p-3 space-y-2">
                <p>
                  Both versions changed <strong>{c.path}</strong>.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    Main
                    <FileText file={c.main} />
                  </div>
                  <div>
                    Task
                    <FileText file={c.task} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {(['main', 'task'] as const).map((choice) => (
                    <Button
                      key={choice}
                      size="sm"
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void run('Resolving…', async () => {
                          setInspected(false);
                          setReview(
                            await resolveTaskReview(review.id, {
                              ...review.resolutions,
                              [c.path]: choice,
                            }),
                          );
                        })
                      }
                    >
                      Use {choice === 'main' ? 'Main' : 'task'}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {!review.conflicts.length && <ReviewDiff review={review} />}
            {review.verificationLog && (
              <details>
                <summary>Verification result</summary>
                <pre className="text-xs max-h-40 overflow-auto whitespace-pre-wrap">
                  {review.verificationLog}
                </pre>
              </details>
            )}
            <CombinedPreview review={review} />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={inspected}
                onChange={(e) => setInspected(e.target.checked)}
                disabled={!review.verifiedKey}
              />
              I reviewed the combined changes and preview, and paused external writers to Main.
            </label>
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!!busy || !!review.conflicts.length}
                onClick={() =>
                  void run('Checking combined result…', async () => {
                    setInspected(false);
                    setReview(await verifyTaskReview(review.id));
                  })
                }
              >
                Check combined result
              </Button>
              <Button
                size="sm"
                disabled={!!busy || !inspected || !review.verifiedKey || !!review.conflicts.length}
                onClick={() =>
                  void run('Merging into Main…', async () => {
                    await applyTaskReview(review.id);
                    setReview(null);
                    navigate(url());
                  })
                }
              >
                Merge into Main
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
