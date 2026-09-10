import { splitNote } from './note-file';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NotesEditor,
  type EditorPersistenceHandle,
  type PendingEditorChange,
} from './tigrana/editor/NotesEditor';
import { request, resolveNotePath, type Entry, type Document } from './bridge';
import './tigrana/styles/app.css';
import './notebook.css';

function reportDirty(dirty: boolean) {
  window.parent.postMessage({ type: 'crux:notebook', id: 'state', op: 'dirty', dirty }, '*');
}

type Publication = { title: string; pages: string[] };
export default function Notebook() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [path, setPath] = useState('');
  const [document, setDocument] = useState<Document | null>(null);
  const [status, setStatus] = useState('Opening notebook…');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [newPath, setNewPath] = useState('');
  const [publication, setPublication] = useState<Publication>({ title: 'My notebook', pages: [] });
  const publicationRevision = useRef<string | null>(null);
  const active = useRef({ path: '', fingerprint: '', saved: '', draft: '', header: '' });
  const editor = useRef<EditorPersistenceHandle | null>(null);
  const pending = useRef<PendingEditorChange | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saves = useRef(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [reloadRequest, setReloadRequest] = useState(0);
  const failed = useRef(false);

  const list = useCallback(async () => {
    const files = await request<Entry[]>('list');
    setEntries(files);
    return files;
  }, []);
  const save = useCallback(async () => {
    const current = active.current;
    if (!current.path) return;
    if (current.draft === current.saved) {
      setStatus('Saved');
      reportDirty(!!pending.current);
      return;
    }
    setStatus('Saving…');
    const content = current.draft;
    const result = await request<{ fingerprint: string }>('write', {
      path: current.path,
      content,
      expected: current.fingerprint,
    });
    current.fingerprint = result.fingerprint;
    current.saved = content;
    failed.current = false;
    setError('');
    setStatus('Saved · Growth checkpoint');
    reportDirty(current.draft !== current.saved || !!pending.current);
  }, []);
  const queueSave = useCallback(() => {
    const operation = saves.current.then(save);
    saves.current = operation.catch((err) => {
      failed.current = true;
      setError(String(err.message));
      setStatus('Not saved');
    });
    return operation;
  }, [save]);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const snapshot = pending.current?.flush() ?? editor.current?.capture();
    if (snapshot?.sourceNotePath === active.current.path)
      active.current.draft = active.current.header + snapshot.markdown;
    await queueSave();
  }, [queueSave]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'crux:notebook:flush') return;
      editor.current?.setReadOnly(true);
      void flush()
        .then(() => {
          reportDirty(false);
          window.parent.postMessage(
            { type: 'crux:notebook', id: 'flush', op: 'flushed', flushId: event.data.id },
            '*',
          );
        })
        .catch((error) =>
          window.parent.postMessage(
            {
              type: 'crux:notebook',
              id: 'flush',
              op: 'flushed',
              flushId: event.data.id,
              error: error.message,
            },
            '*',
          ),
        )
        .finally(() => editor.current?.setReadOnly(false));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [flush]);
  const open = useCallback(
    async (next: string) => {
      setBusy(true);
      try {
        await flush();
        const doc = await request<Document>('read', { path: next });
        const parsed = splitNote(doc.content);
        active.current = {
          header: parsed.header,
          path: next,
          fingerprint: doc.fingerprint,
          saved: doc.content,
          draft: doc.content,
        };
        setPath(next);
        setDocument({ ...doc, content: parsed.body });
        setError('');
        setStatus('Saved');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [flush],
  );
  useEffect(() => {
    let live = true;
    void (async () => {
      const files = await list();
      const config = await request<Document>('read', { path: 'publish.json' });
      if (!live) return;
      setPublication(JSON.parse(config.content));
      publicationRevision.current = config.fingerprint;
      const first =
        files.find((f) => f.path === 'Welcome.md') ?? files.find((f) => /\.md$/i.test(f.path));
      if (first) await open(first.path);
      else setStatus('Create your first note');
    })().catch((err) => setError(err.message));
    const leave = (event: BeforeUnloadEvent) => {
      if (pending.current || active.current.draft !== active.current.saved) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      live = false;
      clearTimeout(timer.current);
      window.removeEventListener('beforeunload', leave);
    };
  }, [list, open]);
  const change = useCallback(
    (markdown: string, source: string | null) => {
      if (source !== active.current.path) return;
      active.current.draft = active.current.header + markdown;
      reportDirty(true);
      setStatus('Unsaved changes');
      clearTimeout(timer.current);
      if (!failed.current)
        timer.current = setTimeout(() => {
          void queueSave().catch(() => {});
        }, 1000);
    },
    [queueSave],
  );
  function downloadDraft() {
    const snapshot = pending.current?.flush() ?? editor.current?.capture();
    const content =
      snapshot?.sourceNotePath === active.current.path
        ? active.current.header + snapshot.markdown
        : active.current.draft;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'notebook-draft.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadSaved() {
    if (!window.confirm('Discard this unsaved draft and reload the saved note?')) return;
    setBusy(true);
    clearTimeout(timer.current);
    try {
      await saves.current;
      const doc = await request<Document>('read', { path });
      const parsed = splitNote(doc.content);
      active.current = {
        path,
        fingerprint: doc.fingerprint,
        saved: doc.content,
        draft: doc.content,
        header: parsed.header,
      };
      setDocument({ ...doc, content: parsed.body });
      setReloadRequest((n) => n + 1);
      failed.current = false;
      setError('');
      setStatus('Saved');
      reportDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    const name = newPath.trim().replace(/\.md$/i, '') + '.md';
    if (!newPath.trim()) return;
    setBusy(true);
    try {
      await flush();
      await request('write', { path: name, content: '', expected: null });
      await list();
      setNewPath('');
      await open(name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selectPublic(checked: boolean) {
    setBusy(true);
    const previous = publication;
    const next = {
      ...publication,
      pages: checked
        ? [...new Set([...publication.pages, path])]
        : publication.pages.filter((p) => p !== path),
    };
    setPublication(next);
    try {
      await flush();
      const saved = await request<{ fingerprint: string }>('write', {
        path: 'publish.json',
        content: JSON.stringify(next, null, 2),
        expected: publicationRevision.current,
      });
      publicationRevision.current = saved.fingerprint;
      setPublication(next);
    } catch (err) {
      setPublication(previous);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notebook-shell">
      <aside className="notebook-sidebar">
        <div className="notebook-brand">
          <span>✳</span>
          <div>
            <strong>Your notebook</strong>
            <small>A place for growing ideas</small>
          </div>
        </div>
        <label className="sr-only" htmlFor="note-search">
          Find a note
        </label>
        <input
          id="note-search"
          placeholder="Find a note…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav aria-label="Notebook pages">
          {entries
            .filter(
              (f) => /\.md$/i.test(f.path) && f.path.toLowerCase().includes(query.toLowerCase()),
            )
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((note) => (
              <button
                key={note.path}
                className={note.path === path ? 'selected' : ''}
                disabled={busy}
                onClick={() => void open(note.path)}
              >
                <span>▤</span>
                {note.path.replace(/\.md$/i, '')}
              </button>
            ))}
        </nav>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor="new-note">New note</label>
          <input
            id="new-note"
            placeholder="Ideas/My next project"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
          />
          <button disabled={busy || !newPath.trim()}>Create note</button>
        </form>
        <p className="notebook-foot">
          Local to this Crux.
          <br />
          Only selected pages are published.
        </p>
        <a href="https://github.com/downcastsystems/tigrana" target="_blank" rel="noreferrer">
          Editor adapted from Tigrana ↗
        </a>
      </aside>
      <main className="notebook-main">
        <header className="notebook-toolbar">
          <span role="status">{status}</span>
          <button onClick={() => void flush().catch(() => {})} disabled={busy}>
            Save now
          </button>
        </header>
        {error && (
          <div role="alert" className="notebook-error">
            {error}
            <p>
              Your open draft is kept here. Copy it before reloading if another editor changed this
              note.
            </p>
            <button onClick={downloadDraft}>Download draft</button>{' '}
            <button disabled={busy} onClick={() => void reloadSaved()}>
              Discard draft and reload
            </button>
          </div>
        )}
        {document && (
          <>
            <div className="notebook-heading">
              <p>{path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'Notebook'}</p>
              <h1>{path.split('/').pop()?.replace(/\.md$/i, '')}</h1>
              <label>
                <input
                  type="checkbox"
                  checked={publication.pages.includes(path)}
                  disabled={busy}
                  onChange={(e) => void selectPublic(e.target.checked)}
                />{' '}
                Include in public edition
              </label>
            </div>
            <section className="notebook-editor" aria-label="Note editor">
              <NotesEditor
                content={document.content}
                historyKey={path}
                reloadRequest={reloadRequest}
                notePath={path}
                workspace={path}
                focusRequest={0}
                focusAtEndRequest={0}
                findRequest={0}
                restorePosition={null}
                editable={!busy}
                spellcheckEnabled
                onChange={change}
                onPendingChange={(value) => {
                  pending.current = value;
                  if (value) reportDirty(true);
                }}
                onPersistenceReady={(handle) => {
                  editor.current = handle;
                }}
                onLoadError={(err) => setError(String(err))}
                onPositionChange={() => {}}
                onInternalLinkClick={(href) => {
                  const next = resolveNotePath(path, href);
                  if (next && entries.some((f) => f.path === next)) void open(next);
                  else setError('That page is not in this notebook.');
                }}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
