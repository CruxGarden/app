import { useEffect, useRef, useState } from 'react';
import type { GardenIdentity } from '@/stores/gardenContext';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, SproutIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/** Read-only graph projection shared by navigation views. It never owns graph state. */
export interface NavigationGraph {
  roots: GardenIdentity[];
  revision: number;
  members: (gardenId: string) => Promise<GardenIdentity[]>;
  ancestors: (gardenId: string) => Promise<string[]>;
}
export interface NavigationViewProps {
  graph: NavigationGraph;
  gardenId: string;
  cruxId: string | null;
  navigate: (gardenId: string, cruxId: string | null) => void;
}

function Branch({
  node,
  parents,
  activePath,
  ...view
}: NavigationViewProps & {
  node: GardenIdentity;
  parents: string[];
  activePath: Set<string>;
}) {
  const { graph, gardenId, cruxId, navigate } = view;
  const isGarden = node.kind === 'garden';
  const selected = isGarden
    ? node.id === gardenId && !cruxId
    : node.id === cruxId && parents.at(-1) === gardenId;
  const reveal = isGarden ? node.id === gardenId && !cruxId : selected;
  const button = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(parents.length === 0);
  const [children, setChildren] = useState<GardenIdentity[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (activePath.has(node.id)) setExpanded(true);
  }, [activePath, node.id]);
  useEffect(() => {
    if (reveal) button.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [reveal]);
  useEffect(() => {
    if (!expanded || !isGarden) return;
    let cancelled = false;
    setError('');
    setLoading(true);
    void graph
      .members(node.id)
      .then((rows) => {
        if (!cancelled) setChildren(rows);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, isGarden, node.id, graph, retry]);
  if (parents.includes(node.id)) return null;
  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg',
          selected ? 'bg-accent-muted text-accent' : 'text-text-muted hover:bg-surface',
        )}
      >
        {isGarden ? (
          <button
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.title || 'Untitled Garden'}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded cursor-pointer"
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <button
          ref={button}
          aria-current={selected ? 'page' : undefined}
          onClick={() => navigate(isGarden ? node.id : parents.at(-1)!, isGarden ? null : node.id)}
          className="flex items-center gap-2 py-2 pr-2 flex-1 min-w-0 text-left text-sm cursor-pointer"
        >
          {isGarden ? <FolderIcon /> : <SproutIcon />}
          <span className="truncate">
            {node.title || (isGarden ? 'Untitled Garden' : 'Untitled Crux')}
          </span>
        </button>
      </div>
      {isGarden && expanded && (
        <ul
          className="ml-3 pl-2 border-l border-border"
          aria-label={`${node.title || 'Garden'} contents`}
        >
          {loading && (
            <li role="status" className="p-2 text-xs text-text-muted">
              Loading…
            </li>
          )}
          {!error &&
            children.map((child) => (
              <Branch
                key={child.id}
                {...view}
                node={child}
                parents={[...parents, node.id]}
                activePath={activePath}
              />
            ))}
          {error && (
            <li role="alert" className="p-2 text-xs text-error">
              {error}{' '}
              <button className="underline cursor-pointer" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** Tree expansion is presentation state. All navigation leaves through one callback. */
export default function NavigationTree(props: NavigationViewProps) {
  const { graph, gardenId } = props;
  const [activePath, setActivePath] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    void graph
      .ancestors(gardenId)
      .then((ids) => {
        if (!cancelled) setActivePath(new Set(ids));
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, gardenId, retry]);
  return (
    <>
      {error && (
        <p role="alert" className="p-2 text-xs text-error">
          {error}{' '}
          <button className="underline cursor-pointer" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
      <ul aria-label="Garden tree">
        {graph.roots.map((root) => (
          <Branch key={root.id} {...props} node={root} parents={[]} activePath={activePath} />
        ))}
      </ul>
    </>
  );
}
