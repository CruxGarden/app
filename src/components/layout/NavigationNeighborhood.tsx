import { useEffect, useRef, useState } from 'react';
import type { NavigationLink, Neighborhood } from '@/services/navigation-neighborhood';
import type { NavigationViewProps } from './navigation-view';
import type { GardenIdentity } from '@/stores/gardenContext';

const groups = [
  ['gate', 'Gates'],
  ['growth', 'Growth'],
  ['garden', 'Gardens'],
  ['graft', 'Grafts'],
] as const;

/** Two bounded rings, laid out as keyboard-accessible connections rather than a
 * moving force simulation. Expanding a neighbor reads only that second hop. */
function Connections({
  graph,
  id,
  depth,
  open,
}: {
  graph: NavigationViewProps['graph'];
  id: string;
  depth: 0 | 1;
  open: (node: GardenIdentity) => Promise<void>;
}) {
  const [result, setResult] = useState<Neighborhood | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [after, setAfter] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void graph
      .neighborhood(id, after)
      .then((page) => {
        if (!cancelled)
          setResult((previous) => ({
            ...page,
            links:
              after && previous
                ? [
                    ...new Map(
                      [...previous.links, ...page.links].map((link) => [link.id, link]),
                    ).values(),
                  ]
                : page.links,
          }));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, id, after, retry]);
  const label = (link: NavigationLink) =>
    link.available ? link.node.title || 'Untitled' : 'Unavailable Crux';
  return (
    <>
      {result &&
        groups.map(([type, title]) => {
          const links = result.links.filter((link) => link.group === type);
          return links.length ? (
            <section key={type} aria-label={title} className="mt-3">
              <h3 className="px-2 mb-1 text-xxs uppercase tracking-widest text-text-muted">
                {title}
              </h3>
              <ul className="space-y-1">
                {links.map((link) => (
                  <li key={link.id}>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={!link.available}
                        onClick={() => void open(link.node)}
                        title={`${link.direction === 'incoming' ? 'Incoming' : 'Outgoing'} ${link.type}${link.kind ? ` · ${link.kind}` : ''}`}
                        className="min-w-0 flex-1 flex items-center gap-2 text-left text-sm rounded-lg p-2 hover:bg-surface disabled:opacity-50 cursor-pointer"
                      >
                        <span aria-hidden="true" className="text-text-muted">
                          {link.direction === 'incoming' ? '←' : '→'}
                        </span>
                        <span className="truncate">{label(link)}</span>
                      </button>
                      {depth === 0 && link.available && (
                        <button
                          aria-label={`Connections of ${label(link)}`}
                          aria-expanded={expanded === link.id}
                          onClick={() => setExpanded(expanded === link.id ? null : link.id)}
                          className="p-2 rounded hover:bg-surface text-text-muted cursor-pointer"
                        >
                          {expanded === link.id ? '−' : '+'}
                        </button>
                      )}
                    </div>
                    {expanded === link.id && (
                      <div className="ml-4 pl-2 border-l border-border">
                        <Connections
                          key={`${link.node.id}:${graph.revision}`}
                          graph={graph}
                          id={link.node.id}
                          depth={1}
                          open={open}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })}
      {loading && (
        <p role="status" className="p-2 text-xs text-text-muted">
          Loading connections…
        </p>
      )}
      {error && (
        <p role="alert" className="p-2 text-xs text-error">
          {error}{' '}
          <button onClick={() => setRetry((n) => n + 1)} className="underline cursor-pointer">
            Retry connections
          </button>
        </p>
      )}
      {!loading && !error && result?.links.length === 0 && (
        <p className="p-2 text-xs text-text-muted">No connections yet.</p>
      )}
      {!loading && !error && result?.next && (
        <button
          onClick={() => setAfter(result.next!)}
          className="p-2 text-sm text-accent cursor-pointer"
        >
          More connections
        </button>
      )}
    </>
  );
}

export default function NavigationNeighborhood({
  graph,
  gardenId,
  cruxId,
  navigate,
}: NavigationViewProps) {
  const id = cruxId ?? gardenId;
  const location = `${gardenId}:${id}`;
  const current = useRef(location);
  current.current = location;
  useEffect(
    () => () => {
      current.current = '';
    },
    [],
  );
  const [error, setError] = useState('');
  const [center, setCenter] = useState<GardenIdentity | null>(null);
  useEffect(() => {
    setError('');
    setCenter(null);
    let cancelled = false;
    void graph
      .identity(id)
      .then((node) => {
        if (!cancelled) setCenter(node);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, graph]);
  const open = async (node: GardenIdentity) => {
    const captured = location;
    setError('');
    try {
      if (node.kind === 'snapshot') {
        const target = await graph.versionTarget(node.id);
        if (current.current === captured)
          navigate(gardenId, target.cruxId, { growthId: target.growthId });
      } else
        navigate(
          node.kind === 'garden' ? node.id : gardenId,
          node.kind === 'garden' ? null : node.id,
        );
    } catch (err) {
      if (current.current === captured) setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <div aria-label="Neighborhood" role="region">
      <div
        className="mx-2 rounded-xl border border-accent/30 bg-accent-muted px-3 py-3 text-center text-sm font-medium"
        aria-current="page"
      >
        {center?.title || 'Current location'}
      </div>
      {error && (
        <p role="alert" className="p-2 text-xs text-error">
          {error}
        </p>
      )}
      <Connections key={`${id}:${graph.revision}`} graph={graph} id={id} depth={0} open={open} />
    </div>
  );
}
