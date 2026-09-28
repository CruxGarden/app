import Explore from '@/pages/Explore';
import { exploreState, useExploreSeed } from './explore-seed';

export default function ExplorePane() {
  const seed = useExploreSeed((s) => s.n);
  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col p-3">
      <Explore key={seed} initial={exploreState.get()} onStateChange={exploreState.set} />
    </div>
  );
}
