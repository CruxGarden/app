import Tending from '@/components/tending/Tending';

/** What is growing and what needs you, across the Garden, beside whatever else is open. */
export default function TendingPane() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <Tending />
    </div>
  );
}
