import { useEffect, useState } from 'react';
import type { NavigationViewProps } from './navigation-view';
import type { GardenIdentity } from '@/stores/gardenContext';
import DimensionConnections from './DimensionConnections';
import { useConnectionNavigation } from './useConnectionNavigation';

export default function NavigationNeighborhood(props: NavigationViewProps) {
  const { graph, gardenId, cruxId } = props;
  const id = cruxId ?? gardenId;
  const { open, error } = useConnectionNavigation(props);
  const [center, setCenter] = useState<GardenIdentity | null>(null);
  useEffect(() => {
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
  return (
    <div aria-label="Neighborhood" role="region">
      <div
        className="mx-2 rounded-xl border border-accent/(--tint-quiet) bg-accent-muted px-3 py-3 text-center text-sm font-medium"
        aria-current="page"
      >
        {center?.title || 'Current location'}
      </div>
      {error && (
        <p role="alert" className="p-2 text-xs text-error">
          {error}
        </p>
      )}
      <DimensionConnections
        key={`${id}:${graph.revision}`}
        graph={graph}
        id={id}
        depth={0}
        open={open}
      />
    </div>
  );
}
