import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { getServices } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { isToolNotice, toolInfo } from '@/lib/tool-info';

export default function ToolInfoSettings() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const openFile = useUIStore((s) => s.openFile);
  const info = toolInfo(crux?.meta);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState('');
  const [document, setDocument] = useState({ text: '', error: '', truncated: false });
  const path = selected || info?.detailsPath;
  const file = artifacts.find((a) => pathOf(a) === path);
  const id = file?.id;
  const fingerprint = file?.fingerprint;
  useEffect(() => {
    setSelected('');
    setExpanded(false);
  }, [crux?.id]);
  useEffect(() => {
    let active = true;
    setDocument({ text: '', error: '', truncated: false });
    if (expanded && id) {
      void getServices()
        .artifact.downloadBlob(id)
        .then(async (blob) => {
          const text = await blob.slice(0, 131072).text();
          if (active) setDocument({ text, error: '', truncated: blob.size > 131072 });
        })
        .catch((error: Error) => {
          if (active) setDocument({ text: '', error: error.message, truncated: false });
        });
    }
    return () => {
      active = false;
    };
  }, [crux?.id, expanded, id, fingerprint]);
  if (!info) return null;
  const notices = artifacts
    .filter((a) => isToolNotice(pathOf(a)))
    .sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
  return (
    <section className="p-3 border-b border-border space-y-2 text-xs" aria-label="About this tool">
      <h2 className="font-medium">About this tool</h2>
      <p>{info.relationship}</p>
      <a href={info.upstream} target="_blank" rel="noopener noreferrer" className="underline">
        {info.name} — upstream project and contributors
      </a>
      <p className="text-text-muted">
        An independent Garden adaptation. Upstream names and credits do not imply endorsement.
      </p>
      <button
        className="underline block"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Version, adaptations and licenses
      </button>
      {expanded && (
        <div className="space-y-2">
          <p className="text-text-muted">
            These records belong to this Crux. They travel with complete exports and Growth;
            customized or older copies may differ from today’s template.
          </p>
          <label className="block">
            <span className="block mb-1">Tool information and notices</span>
            <select
              value={path}
              onChange={(event) => setSelected(event.target.value)}
              className="w-full p-2 bg-surface-solid text-text border border-border rounded-[var(--radius-sm)]"
            >
              <option value={info.detailsPath}>Version and Garden adaptations</option>
              {notices
                .filter((a) => pathOf(a) !== info.detailsPath)
                .map((a) => (
                  <option key={a.id} value={pathOf(a)}>
                    {pathOf(a)}
                  </option>
                ))}
            </select>
          </label>
          {!file && (
            <p role="status">
              This Crux does not contain {path}. Its version or notices cannot be verified here.
            </p>
          )}
          {document.error && <p role="alert">Could not read this record: {document.error}</p>}
          {file && !document.text && !document.error && <p role="status">Loading record…</p>}
          {document.text && (
            <div
              className="max-h-80 overflow-y-auto break-words space-y-2"
              data-testid="tool-info-document"
            >
              <ReactMarkdown
                components={{
                  img: ({ alt }) => <span>{alt}</span>,
                  a: ({ href, children }) =>
                    href && /^https:\/\//.test(href) ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {children}
                      </a>
                    ) : (
                      <span>{children}</span>
                    ),
                  p: ({ children }) => <p className="mb-2 whitespace-pre-wrap">{children}</p>,
                }}
              >
                {document.text}
              </ReactMarkdown>
            </div>
          )}
          {document.truncated && (
            <p className="text-text-muted">
              Showing the first 128 KiB. Open the Artifact to read the full record.
            </p>
          )}
          {file && (
            <button className="underline" onClick={() => openFile(file.id, pathOf(file))}>
              Open record in Artifacts
            </button>
          )}
          {notices.length === 0 && (
            <p className="text-text-muted">
              No separate license or notice files were found in this Crux.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
