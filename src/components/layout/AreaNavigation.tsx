import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { buttonClass } from '@/components/ui';
import { isPublicSite } from '@/lib/site';

// Each area remembers its own location for this window. These are presentation
// destinations only: changing area never moves or publishes a Crux.
const useAreaLocations = create(() => ({ garden: '/home', explore: '/explore' }));

export default function AreaNavigation({ area }: { area: 'garden' | 'explore' }) {
  const location = useLocation();
  const destinations = useAreaLocations();
  const path = `${location.pathname}${location.search}${location.hash}`;
  useEffect(() => {
    useAreaLocations.setState({ [area]: path });
  }, [area, path]);

  // Visitors have no local workspace in the public website. Its download link
  // explains how to get one; never send them to the withdrawn browser builder.
  if (isPublicSite()) return null;
  return (
    <nav aria-label="Garden and Explore" className="flex items-center gap-1 shrink-0">
      {(['garden', 'explore'] as const).map((destination) => (
        <Link
          key={destination}
          to={destinations[destination]}
          aria-current={area === destination ? 'true' : undefined}
          title={destination === 'garden' ? 'Your workspace' : 'Discover published creations'}
          className={buttonClass(area === destination ? 'secondary' : 'ghost', 'xs')}
        >
          {destination === 'garden' ? 'Garden' : 'Explore'}
        </Link>
      ))}
    </nav>
  );
}
