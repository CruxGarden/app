import { memo } from 'react';
import type { Crux } from '@/api/types';
import CruxCard from './CruxCard';

interface GardenGridProps {
  cruxes: Crux[];
  linkBuilder?: (crux: Crux) => string;
  onDelete?: (id: string) => void;
  sortBy?: 'created' | 'updated';
  hideMenu?: boolean;
  /** cruxId → Blob Store fingerprint of its preview.jpg (local gardens). */
  thumbnails?: Record<string, string>;
  /** cruxId → image URL (public gardens). */
  thumbnailUrls?: Record<string, string>;
  tendingCounts?: Record<string, number>;
}

export default memo(function GardenGrid({
  cruxes,
  linkBuilder,
  onDelete,
  sortBy,
  hideMenu,
  thumbnails,
  thumbnailUrls,
  tendingCounts,
}: GardenGridProps) {
  return (
    <div
      className="grid"
      style={{
        gap: 'var(--garden-grid-gap)',
        gridTemplateColumns: 'repeat(auto-fill, minmax(var(--garden-card-min-width), 1fr))',
      }}
    >
      {cruxes.map((crux) => (
        <CruxCard
          key={crux.id}
          crux={crux}
          tendingCount={tendingCounts?.[crux.id]}
          linkTo={linkBuilder?.(crux)}
          onDelete={onDelete}
          sortBy={sortBy}
          hideMenu={hideMenu}
          thumbnailFingerprint={thumbnails?.[crux.id]}
          thumbnailUrl={thumbnailUrls?.[crux.id]}
        />
      ))}
    </div>
  );
});
