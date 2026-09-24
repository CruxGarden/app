import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMatch, useSearchParams } from 'react-router-dom';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import {
  gardenPath,
  inGarden,
  useGardenContext,
  type GardenIdentity,
} from '@/stores/gardenContext';
import { gardenAncestors, gardenMembers } from '@/services/garden-navigation';
import {
  navigationNeighborhood,
  navigationVersionTarget,
} from '@/services/navigation-neighborhood';
import { getSqliteClient } from '@/services/sqlite/client';
import type { NavigationGraph, NavigationViewProps } from './navigation-view';

/** Presentation adapters share one graph reader and one shallow route writer. */
export function useNavigationView(enabled = true): NavigationViewProps & { refresh: () => void } {
  const { root, garden, revision } = useGardenContext();
  const route = useMatch('/c/:id');
  const [search] = useSearchParams();
  const neighborhood = search.get('navView') === 'neighborhood';
  const navigate = useMoodNavigate();
  const [refreshRevision, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    return getSqliteClient().onChange?.((change) => {
      if (
        change.entity === 'database' ||
        (change.entity === 'crux' &&
          change.fields?.some((field) => field === 'title' || field === 'growth'))
      )
        setRefresh((n) => n + 1);
    });
  }, [enabled]);
  const graph = useMemo<NavigationGraph>(
    () => ({
      roots: root ? [root] : [],
      revision: revision + refreshRevision,
      neighborhood: navigationNeighborhood,
      versionTarget: navigationVersionTarget,
      members: gardenMembers,
      ancestors: gardenAncestors,
      identity: async (id) => {
        const row = await getSqliteClient().get<GardenIdentity>(
          'SELECT id, title, slug, kind FROM cruxes WHERE id = ? AND deleted IS NULL',
          [id],
        );
        if (!row) throw new Error('This location is unavailable.');
        return row;
      },
    }),
    [root, revision, refreshRevision],
  );
  const navigateTo = useCallback<NavigationViewProps['navigate']>(
    (gardenId, cruxId, selection) => {
      const path = cruxId ? inGarden(`/c/${cruxId}`, gardenId) : gardenPath(gardenId);
      navigate(
        `${path}${neighborhood ? '&navView=neighborhood' : ''}${selection ? `&growth=${encodeURIComponent(selection.growthId)}` : ''}`,
      );
    },
    [navigate, neighborhood],
  );
  return {
    graph,
    gardenId: garden?.id ?? '',
    cruxId: route?.params.id ?? null,
    navigate: navigateTo,
    refresh: () => setRefresh((n) => n + 1),
  };
}
