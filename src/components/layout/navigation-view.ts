import type { Neighborhood } from '@/services/navigation-neighborhood';
import type { GardenIdentity } from '@/stores/gardenContext';

/** Read-only graph projection shared by navigation views. It never owns graph state. */
export interface NavigationGraph {
  roots: GardenIdentity[];
  revision: number;
  members: (gardenId: string) => Promise<GardenIdentity[]>;
  ancestors: (gardenId: string) => Promise<string[]>;
  identity: (id: string) => Promise<GardenIdentity>;
  neighborhood: (id: string, after?: string) => Promise<Neighborhood>;
  versionTarget: (id: string) => Promise<{ cruxId: string; growthId: string }>;
}
export interface NavigationViewProps {
  graph: NavigationGraph;
  gardenId: string;
  cruxId: string | null;
  navigate: (gardenId: string, cruxId: string | null, selection?: { growthId: string }) => void;
}
