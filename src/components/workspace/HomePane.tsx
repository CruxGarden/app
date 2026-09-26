import HomeGarden from '@/pages/HomeGarden';

/** A Garden's Home, as a pane of the Garden's own workspace. */
export default function HomePane() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <HomeGarden />
    </div>
  );
}
