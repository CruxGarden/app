import type { Crux } from '@/api/types';
import CruxCard from './CruxCard';

interface GardenGridProps {
  cruxes: Crux[];
  onDelete?: (id: string) => void;
}

export default function GardenGrid({ cruxes, onDelete }: GardenGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cruxes.map((crux) => (
        <CruxCard key={crux.id} crux={crux} onDelete={onDelete} />
      ))}
    </div>
  );
}
