import { Button } from '@/components/ui';

interface GardenEmptyProps {
  hasSearch: boolean;
  onNewCrux: () => void;
  onClearSearch: () => void;
}

export default function GardenEmpty({ hasSearch, onNewCrux, onClearSearch }: GardenEmptyProps) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center py-20">
        <svg
          width="120"
          height="60"
          viewBox="0 0 120 60"
          fill="none"
          className="mb-6 opacity-20"
        >
          <circle cx="60" cy="30" r="20" stroke="currentColor" strokeWidth="1.5" />
          <path d="M52 30h16M60 22v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
        <p className="text-sm text-text-muted mb-4">No cruxes match your search</p>
        <Button variant="ghost" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-20">
      {/* Empty soil — barren garden bed */}
      <svg
        width="160"
        height="80"
        viewBox="0 0 160 80"
        fill="none"
        className="mb-8 opacity-25"
      >
        <ellipse cx="80" cy="60" rx="72" ry="16" fill="currentColor" opacity="0.3" />
        <ellipse cx="80" cy="58" rx="64" ry="12" fill="currentColor" opacity="0.2" />
        <circle cx="40" cy="58" r="1.5" fill="currentColor" opacity="0.4" />
        <circle cx="55" cy="62" r="1" fill="currentColor" opacity="0.3" />
        <circle cx="70" cy="56" r="1.5" fill="currentColor" opacity="0.35" />
        <circle cx="88" cy="60" r="1" fill="currentColor" opacity="0.4" />
        <circle cx="100" cy="55" r="1.5" fill="currentColor" opacity="0.3" />
        <circle cx="115" cy="59" r="1" fill="currentColor" opacity="0.35" />
        <circle cx="65" cy="64" r="1" fill="currentColor" opacity="0.25" />
        <circle cx="95" cy="63" r="1.5" fill="currentColor" opacity="0.25" />
        <line x1="8" y1="58" x2="152" y2="58" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
      </svg>
      <p className="text-sm text-text-muted mb-4">Your garden is empty</p>
      <Button onClick={onNewCrux}>Plant Something</Button>
    </div>
  );
}
