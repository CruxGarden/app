import Explore, { type ExploreState } from '@/pages/Explore';

// The pane is unmounted when the workspace changes (opening a result leaves
// the workspace); the search comes back with it.
let lastState: Partial<ExploreState> | undefined;

export default function ExplorePane() {
  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col p-3">
      <Explore initial={lastState} onStateChange={(state) => (lastState = state)} />
    </div>
  );
}
