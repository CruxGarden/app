import { Button } from '@/components/ui';

interface GardenEmptyProps {
  hasSearch: boolean;
  onNewCrux: () => void;
  onClearSearch: () => void;
}

export default function GardenEmpty({ hasSearch, onNewCrux, onClearSearch }: GardenEmptyProps) {
  if (hasSearch) {
    return (
      <div className="bg-panel border border-border rounded-[var(--radius)] flex flex-col items-center py-10">
        <p className="text-sm text-text-muted mb-3">No cruxes match your search</p>
        <Button variant="ghost" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-[var(--radius)] flex flex-col items-center py-10">
      <p className="text-sm text-text-muted mb-3">Your garden is empty</p>
      <Button onClick={onNewCrux}>Plant Something</Button>
    </div>
  );
}
