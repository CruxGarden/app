import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getServices } from '@/services';
import type { Artifact, ChatMessage, Crux } from '@/api/types';
import type { GrowthGraph, GrowthNode } from '@/services/growth-graph';
import { pathOf } from '@/lib/artifact-path';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';

function ArtifactContent({ artifact }: { artifact: Artifact }) {
  const [content, setContent] = useState<{ text?: string; url?: string; error?: string }>({});
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    const read = async () => {
      if (artifact.size > 2 * 1024 * 1024)
        return { text: 'This Artifact is over 2 MB. Open its Working Copy to inspect it.' };
      const service = getServices().artifact;
      if (artifact.mimeType.startsWith('image/') && artifact.mimeType !== 'image/svg+xml') {
        const blob = await service.downloadBlob(artifact.id);
        if (!live) return {};
        url = URL.createObjectURL(blob);
        return { url };
      }
      if (artifact.encoding !== 'utf-8')
        return { text: `Binary Artifact · ${artifact.size} bytes` };
      const text = await service.readContent(artifact.id);
      return { text: text.length > 30000 ? `${text.slice(0, 30000)}\n[Preview truncated]` : text };
    };
    void read()
      .then((value) => {
        if (live) setContent(value);
      })
      .catch((error: Error) => {
        if (live) setContent({ error: error.message });
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [artifact]);
  if (content.error) return <p role="alert">{content.error}</p>;
  if (content.url)
    return <img src={content.url} alt={pathOf(artifact)} className="max-h-64 object-contain" />;
  return (
    <pre className="text-xs whitespace-pre-wrap break-words max-h-64 overflow-auto p-2 bg-surface rounded">
      {content.text ?? 'Loading Artifact…'}
    </pre>
  );
}

export default function GrowthInspector({
  graph,
  node,
  onSelect,
  onClose,
}: {
  graph: GrowthGraph;
  node: GrowthNode;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<{
    snapshot: Crux;
    artifacts: Artifact[];
    summary?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [fileId, setFileId] = useState('');
  const [messageLimit, setMessageLimit] = useState(20);
  const lane = graph.lanes.find((l) => l.id === node.ownerId)!;
  useEffect(() => {
    if (node.kind === 'copy') return;
    let live = true;
    const { crux, artifact, dimension } = getServices();
    void Promise.all([
      crux.findById(node.id),
      artifact.findByResource('crux', node.id),
      node.dimensionId ? dimension.findById(node.dimensionId) : Promise.resolve(null),
    ])
      .then(([snapshot, artifacts, growth]) => {
        if (live) {
          setDetail({
            snapshot,
            artifacts,
            summary: typeof growth?.meta?.summary === 'string' ? growth.meta.summary : undefined,
          });
          setFileId(artifacts.find((a) => pathOf(a) === 'preview.jpg')?.id ?? '');
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [node.id, node.kind, node.dimensionId]);
  const messages = (detail?.snapshot.meta?.messages ?? []) as ChatMessage[];
  const parents = graph.links.filter((l) => l.target === node.id);
  const file = detail?.artifacts.find((a) => a.id === fileId);
  return (
    <div className="space-y-4 p-4 text-sm" data-testid="growth-inspector">
      <div>
        <p className="text-xs text-accent font-mono">
          {lane.title} ·{' '}
          {node.kind === 'copy'
            ? lane.phase === 'main'
              ? 'Working Copy'
              : lane.phase
            : node.kind === 'merge'
              ? 'Merge checkpoint'
              : 'Checkpoint'}
        </p>
        <h3 className="font-display text-lg mt-1 break-words">{node.title}</h3>
        {node.created && (
          <p className="text-xs text-text-muted">{new Date(node.created).toLocaleString()}</p>
        )}
      </div>
      <Link
        onClick={onClose}
        to={`/c/${graph.cruxId}${lane.id === graph.cruxId ? '' : `?task=${lane.id}`}`}
        className="text-accent underline"
      >
        Open {lane.title}
      </Link>
      {node.kind === 'copy' && (
        <p className="text-text-muted">
          This marks the saved history for this Working Copy. Unsnapshotted edits are not a
          checkpoint. Merged and archived Tasks keep their history.
        </p>
      )}
      {parents.length > 0 && (
        <div className="space-y-1">
          <h4 className="font-medium">
            {node.kind === 'merge' ? 'Brought together' : 'Previous history'}
          </h4>
          {parents.map((link) => {
            const parent = graph.nodes.find((n) => n.id === link.source);
            return (
              parent && (
                <button
                  key={link.source}
                  onClick={() => onSelect(parent.id)}
                  className="block text-left text-accent underline text-xs"
                >
                  {graph.lanes.find((l) => l.id === parent.ownerId)?.title} · {parent.title}
                  {link.kind === 'merge' ? ' · merged Task' : ''}
                </button>
              )
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {node.kind !== 'copy' && !detail && !error && <p role="status">Loading checkpoint…</p>}
      {detail && (
        <>
          {(detail.summary || detail.snapshot.data) && (
            <div className="text-xs text-text-muted whitespace-pre-wrap">
              {detail.summary || detail.snapshot.data}
            </div>
          )}
          <section className="space-y-2">
            <h4 className="font-medium">Artifacts · {detail.artifacts.length}</h4>
            <select
              aria-label="Checkpoint Artifact"
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              className="w-full bg-surface border border-border rounded p-2 text-xs"
            >
              <option value="">Choose an Artifact</option>
              {detail.artifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {pathOf(a)}
                </option>
              ))}
            </select>
            {file && <ArtifactContent key={file.id} artifact={file} />}
          </section>
          <section className="space-y-3">
            <h4 className="font-medium">Collaboration at this checkpoint</h4>
            {!messages.length && (
              <p className="text-xs text-text-muted">
                No new messages recorded at this checkpoint.
              </p>
            )}
            {messages.slice(0, messageLimit).map((message, i) => (
              <div key={i} className="border-l-2 border-border pl-3 text-xs break-words">
                <p className="font-mono text-accent mb-1">
                  {message.role === 'user'
                    ? 'You'
                    : message.agent || message.model || 'Collaborator'}
                </p>
                <MarkdownRenderer content={message.content.slice(0, 30000)} />
                {message.content.length > 30000 && (
                  <p className="text-text-muted">
                    Message preview truncated; the full message remains in Collaboration.
                  </p>
                )}
                {!!message.toolCalls?.length && (
                  <p className="text-text-muted">
                    Tools: {message.toolCalls.map((t) => t.name).join(', ')}
                  </p>
                )}
              </div>
            ))}
            {messages.length > messageLimit && (
              <button
                className="text-accent underline"
                onClick={() => setMessageLimit((n) => n + 20)}
              >
                Show more messages
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
