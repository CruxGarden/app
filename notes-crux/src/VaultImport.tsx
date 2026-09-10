import { useRef, useState } from 'react';
import { request } from './bridge';
const image = /\.(png|jpe?g|gif|webp)$/i;
function supported(path: string) {
  if (path.split('/').some((p) => p.startsWith('.') && p !== '.assets' && p !== '.tigrana'))
    return false;
  return (
    /\.md$/i.test(path) ||
    image.test(path) ||
    /(?:^|\/)\.tigrana\/(metadata|index|folder)\.json$/.test(path)
  );
}
export function VaultImport({
  beforeImport,
  afterImport,
}: {
  beforeImport(): Promise<void>;
  afterImport(path: string): Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<{
    files: File[];
    skipped: number;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function importFiles() {
    if (!selection) return;
    setBusy(true);
    setError('');
    try {
      await beforeImport();
      const files = [];
      for (const file of selection.files) {
        const path = file.webkitRelativePath.split('/').slice(1).join('/');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let content: string;
        if (image.test(path)) {
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const ext = path.split('.').pop()!.toLowerCase();
          content = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${btoa(binary)}`;
        } else content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        files.push({ path, content });
      }
      const result = await request<{
        root: string;
        notes: number;
        imported: number;
        firstNote: string;
      }>('import', { name: selection.name, files });
      await afterImport(result.firstNote);
      setMessage(
        `Imported ${result.notes} notes into ${result.root}. All imported notes are private.`,
      );
      setSelection(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="vault-import">
      <button disabled={busy} onClick={() => input.current?.click()}>
        Import notebook folder
      </button>
      <input
        ref={input}
        type="file"
        multiple
        {...{ webkitdirectory: '' }}
        hidden
        aria-label="Choose notebook folder"
        onChange={(event) => {
          const all = Array.from(event.target.files ?? []);
          event.target.value = '';
          setError('');
          setMessage('');
          if (!all.length) return;
          const files = all.filter((file) =>
            supported(file.webkitRelativePath.split('/').slice(1).join('/')),
          );
          if (!files.some((f) => /\.md$/i.test(f.name))) {
            setError('Choose a folder containing Markdown notes.');
            return;
          }
          if (
            files.length > 2000 ||
            files.reduce((n, f) => n + f.size, 0) > 48_000_000 ||
            files.some((f) => (image.test(f.name) ? f.size > 5_000_000 : f.size > 8_000_000))
          ) {
            setError('Choose up to 2,000 files / 48 MB. Images must be smaller than 5 MB.');
            return;
          }
          setSelection({
            files,
            skipped: all.length - files.length,
            name: all[0]!.webkitRelativePath.split('/')[0]!,
          });
        }}
      />
      {selection && (
        <div role="dialog" aria-label="Import notebook" className="vault-import-review">
          <strong>Copy your notebook into this Crux</strong>
          <p>
            {selection.files.filter((f) => /\.md$/i.test(f.name)).length} notes ·{' '}
            {selection.files.filter((f) => image.test(f.name)).length} images · {selection.skipped}{' '}
            unsupported files skipped.
          </p>
          <p>
            Folders, links and frontmatter are preserved. Tigrana metadata is kept for portability;
            pinning and folder colors are not displayed here.
          </p>
          <p>
            Your original folder stays unchanged. Imported notes start private. This is a copy, not
            a synchronized folder.
          </p>
          <label>
            Import name
            <input
              aria-label="Import name"
              disabled={busy}
              value={selection.name}
              onChange={(event) => setSelection({ ...selection, name: event.target.value })}
            />
          </label>
          <button disabled={busy} onClick={() => void importFiles()}>
            {busy ? 'Importing…' : 'Import notes'}
          </button>
          <button disabled={busy} onClick={() => setSelection(null)}>
            Cancel import
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
