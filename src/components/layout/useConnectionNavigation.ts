import { useEffect, useRef, useState } from 'react';
import type { GardenIdentity } from '@/stores/gardenContext';
import type { NavigationViewProps } from './navigation-view';

/** Shared dimension activation. A late version lookup cannot take over a new location. */
export function useConnectionNavigation({
  graph,
  gardenId,
  cruxId,
  navigate,
}: NavigationViewProps) {
  const location = `${gardenId}:${cruxId ?? ''}`;
  const current = useRef(location);
  current.current = location;
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
  }, [location]);
  useEffect(
    () => () => {
      current.current = '';
    },
    [],
  );
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
  return { open, error };
}
