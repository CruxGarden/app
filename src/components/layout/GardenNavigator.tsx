import { useEffect, useState } from 'react';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { gardenPath, useGardenContext, type GardenIdentity } from '@/stores/gardenContext';
import { gardenAncestors, gardenMembers } from '@/services/garden-navigation';
import { ChevronRightIcon, ChevronDownIcon, CloseIcon, FolderIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

function GardenBranch({
  garden,
  ancestors = [],
  activePath,
}: {
  garden: GardenIdentity;
  ancestors?: string[];
  activePath: Set<string>;
}) {
  const navigate = useMoodNavigate();
  const revision = useGardenContext((s) => s.revision);
  const active = useGardenContext((s) => s.garden?.id);
  const [expanded, setExpanded] = useState(ancestors.length === 0);
  const [children, setChildren] = useState<GardenIdentity[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (activePath.has(garden.id)) setExpanded(true);
  }, [activePath, garden.id]);
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setError('');
    void gardenMembers(garden.id)
      .then((rows) => {
        if (!cancelled) setChildren(rows.filter((row) => row.kind === 'garden'));
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, garden.id, active, revision]);
  if (ancestors.includes(garden.id)) return null;
  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg',
          active === garden.id ? 'bg-accent-muted text-accent' : 'text-text-muted hover:bg-surface',
        )}
      >
        <button
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${garden.title}`}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded cursor-pointer"
        >
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
        <button
          aria-current={active === garden.id ? 'page' : undefined}
          onClick={() => navigate(gardenPath(garden.id))}
          className="flex items-center gap-2 py-2 pr-2 flex-1 min-w-0 text-left text-sm cursor-pointer"
        >
          <FolderIcon />
          <span className="truncate">{garden.title || 'Untitled Garden'}</span>
        </button>
      </div>
      {expanded && (
        <ul className="ml-3 pl-2 border-l border-border">
          {children.map((child) => (
            <GardenBranch
              key={child.id}
              garden={child}
              ancestors={[...ancestors, garden.id]}
              activePath={activePath}
            />
          ))}
          {error && (
            <li role="alert" className="p-2 text-xs text-error">
              {error}
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** A real workspace panel: navigation does not obscure or suspend the work. */
export default function GardenNavigator() {
  const { root, garden, revision, navigatorOpen, setNavigatorOpen } = useGardenContext();
  const gardenId = garden?.id;
  const [activePath, setActivePath] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  useEffect(() => {
    if (!navigatorOpen || !gardenId) return;
    let cancelled = false;
    setError('');
    void gardenAncestors(gardenId)
      .then((ids) => {
        if (!cancelled) setActivePath(new Set(ids));
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [gardenId, revision, navigatorOpen]);
  if (!navigatorOpen || !root) return null;
  return (
    <aside
      aria-label="Navigator"
      className="w-64 max-w-[45vw] shrink-0 border-r border-border bg-panel text-text flex flex-col min-h-0"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-display font-medium">Navigator</h2>
        <button
          aria-label="Close Navigator"
          onClick={() => setNavigatorOpen(false)}
          className="p-1 rounded hover:bg-surface cursor-pointer"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 px-2 pb-4">
        <p className="px-2 pt-3 pb-2 text-xxs tracking-widest uppercase text-text-muted">
          On this device
        </p>
        {error && (
          <p role="alert" className="p-2 text-xs text-error">
            {error}
          </p>
        )}
        <ul>
          <GardenBranch garden={root} activePath={activePath} />
        </ul>
      </div>
    </aside>
  );
}
