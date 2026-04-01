import { memo } from 'react';
import type { Crux } from '@/api/types';
import { Panel } from '@/components/ui';
import CruxCard from './CruxCard';

interface GardenGridProps {
  cruxes: Crux[];
  linkBuilder?: (crux: Crux) => string;
  onDelete?: (id: string) => void;
  sortBy?: 'created' | 'updated';
  hideMenu?: boolean;
}

export default memo(function GardenGrid({ cruxes, linkBuilder, onDelete, sortBy, hideMenu }: GardenGridProps) {
  return (
    <Panel padding="none">
      <div className="flex flex-col">
        {cruxes.map((crux) => (
          <CruxCard
            key={crux.id}
            crux={crux}
            linkTo={linkBuilder?.(crux)}
            onDelete={onDelete}
            sortBy={sortBy}
            hideMenu={hideMenu}
          />
        ))}
      </div>
    </Panel>
  );
})
