import { useEffect, useRef, useState } from 'react';
import type { MockupProject } from './types';
import { openProjectFile, saveProjectFile } from './lib/mockupsApi';
import { validateProject } from './lib/validation';
import { request, type Document } from './bridge';
import { AppAppearance } from './AppAppearance';

function dirty(value: boolean) {
  window.parent.postMessage({ type: 'crux:app', id: 'state', op: 'dirty', dirty: value }, '*');
}
function download(project: MockupProject) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'wireframes.moq';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Options = {
  project: MockupProject;
  readOnly: boolean;
  load(project: MockupProject, saved?: boolean): void;
  capture(): void;
  saved(project: MockupProject): void;
};
export function useGardenProject(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [ready, setReady] = useState(options.readOnly);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(options.readOnly ? 'Public edition' : 'Opening project…');
  const [busy, setBusy] = useState(false);
  const saved = useRef('');
  const tail = useRef(Promise.resolve());
  const failure = useRef(false);
  const readyRef = useRef(options.readOnly);
  const publicationFailure = useRef(false);
  const publicationRevision = useRef(0);
  const publicationTail = useRef(Promise.resolve());
  const [publication, setPublication] = useState<{ title: string; wireframes: string[] }>({
    title: '',
    wireframes: [],
  });
  const publicationRef = useRef({ value: publication, fingerprint: '' });

  async function load() {
    try {
      setBusy(true);
      await tail.current;
      await publicationTail.current;
      const [project, manifest] = await Promise.all([
        openProjectFile('project.json'),
        request<Document>('read', { path: 'publish.json' }),
      ]);
      const config = JSON.parse(manifest.content);
      if (!Array.isArray(config.wireframes)) throw new Error('Invalid publication settings.');
      saved.current = JSON.stringify(project);
      latest.current.load(project);
      latest.current.saved(project);
      publicationRef.current = { value: config, fingerprint: manifest.fingerprint };
      setPublication(config);
      failure.current = false;
      publicationFailure.current = false;
      setError('');
      setStatus('Saved');
      readyRef.current = true;
      setReady(true);
      dirty(false);
    } catch (e) {
      failure.current = true;
      setError(String(e));
      setStatus('Could not open project');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (latest.current.readOnly) return;
    if (!readyRef.current) throw new Error('The project has not finished opening.');
    latest.current.capture();
    const operation = tail.current.then(async () => {
      const project = latest.current.project;
      const serialized = JSON.stringify(project);
      if (serialized === saved.current) return;
      setStatus('Saving…');
      await saveProjectFile('project.json', project);
      saved.current = serialized;
      latest.current.saved(project);
      failure.current = false;
      setError('');
      const changed = JSON.stringify(latest.current.project) !== serialized;
      dirty(changed);
      setStatus(changed ? 'Unsaved changes' : 'Saved');
    });
    tail.current = operation.catch((e) => {
      failure.current = true;
      setError(String(e));
      setStatus('Save failed — draft retained');
      dirty(true);
    });
    return operation;
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (options.readOnly) return;
    void load();
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.type !== 'crux:app:flush') return;
      setBusy(true);
      void (async () => {
        try {
          await saveRef.current();
          await publicationTail.current;
          if (failure.current || publicationFailure.current)
            throw new Error('Resolve the save error before leaving.');
          dirty(false);
          window.parent.postMessage(
            { type: 'crux:app', id: 'flush', op: 'flushed', flushId: event.data.id },
            '*',
          );
        } catch (e) {
          window.parent.postMessage(
            {
              type: 'crux:app',
              id: 'flush',
              op: 'flushed',
              flushId: event.data.id,
              error: String(e),
            },
            '*',
          );
        } finally {
          setBusy(false);
        }
      })();
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (options.readOnly || !ready) return;
    const changed = JSON.stringify(options.project) !== saved.current;
    dirty(changed || failure.current);
    if (!changed || failure.current) return;
    setStatus('Unsaved changes');
    const timer = setTimeout(() => {
      void saveRef.current().catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [options.project, ready, options.readOnly]);
  // Garden owns close/navigation confirmation and flushes this editor through the bridge.
  // A second iframe beforeunload prompt can race Electron's approved shutdown.
  function selectPublication(id: string, included: boolean) {
    dirty(true);
    const revision = ++publicationRevision.current;
    setStatus('Saving publication choices…');
    setPublication((current) => ({
      ...current,
      wireframes: included
        ? [...current.wireframes.filter((value) => value !== id), id]
        : current.wireframes.filter((value) => value !== id),
    }));
    publicationTail.current = publicationTail.current
      .then(async () => {
        const previous = publicationRef.current;
        const wireframes = previous.value.wireframes.filter((value) => value !== id);
        if (included) wireframes.push(id);
        const value = { ...previous.value, wireframes };
        const result = await request<{ fingerprint: string }>('write', {
          path: 'publish.json',
          expected: previous.fingerprint,
          content: JSON.stringify(value, null, 2),
        });
        publicationRef.current = { value, fingerprint: result.fingerprint };
        publicationFailure.current = false;
        if (revision === publicationRevision.current) {
          setPublication(value);
          const changed = JSON.stringify(latest.current.project) !== saved.current;
          dirty(changed || failure.current);
          setStatus(changed ? 'Unsaved changes' : 'Saved');
        }
      })
      .catch((e) => {
        publicationFailure.current = true;
        setStatus('Publication save failed — reload settings');
        setError(String(e));
        dirty(true);
        if (revision === publicationRevision.current) setPublication(publicationRef.current.value);
      });
  }
  return {
    ready,
    busy,
    error,
    status,
    save,
    publication,
    selectPublication,
    reload: async () => {
      if (window.confirm('Discard this draft and reload the saved project?')) await load();
    },
    download: () => {
      latest.current.capture();
      download(latest.current.project);
    },
    import: async (file: File) => {
      try {
        const project = validateProject(JSON.parse(await file.text()));
        await saveRef.current();
        latest.current.load(project, false);
      } catch (e) {
        setError(String(e));
      }
    },
  };
}
export function GardenControls({
  garden,
  project,
}: {
  garden: ReturnType<typeof useGardenProject>;
  project: MockupProject;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="garden-controls">
        <AppAppearance />
        <span role="status">{garden.status}</span>
        <button disabled={!garden.ready || garden.busy} onClick={() => input.current?.click()}>
          Import .moq
        </button>
        <input
          ref={input}
          aria-label="Import Moqira project"
          type="file"
          accept=".moq,.moqira,.dsmockup,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void garden.import(file);
            event.target.value = '';
          }}
        />
        <button onClick={garden.download}>Download .moq</button>
        <label>
          <input
            type="checkbox"
            disabled={!garden.ready || garden.busy}
            checked={garden.publication.wireframes.includes(project.activeWireframeId)}
            onChange={(event) =>
              garden.selectPublication(project.activeWireframeId, event.target.checked)
            }
          />{' '}
          Include in public edition
        </label>
      </div>
      {(!garden.ready || garden.busy) && <div className="garden-loading">{garden.status}</div>}
      {garden.error && (
        <div className="garden-error" role="alert">
          {garden.error}
          <p>Your draft has been retained. Download it before discarding.</p>
          <button onClick={garden.download}>Download draft</button>
          <button onClick={() => void garden.save().catch(() => {})}>Retry save</button>
          <button onClick={() => void garden.reload()}>Discard draft and reload</button>
        </div>
      )}
    </>
  );
}
