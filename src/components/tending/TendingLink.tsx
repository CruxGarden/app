import { Link } from 'react-router-dom';
import { useTendingRows } from '@/stores/tendingStore';
import { attentionCount } from '@/services/tending-state';

export default function TendingLink({ cruxId }: { cruxId?: string }) {
  const rows = useTendingRows();
  const states = rows.filter((r) => !cruxId || r.cruxId === cruxId).map((r) => r.state);
  const count = attentionCount(states);
  if (cruxId && !count) return null;
  return (
    <Link
      to="/tending"
      className="text-xs text-accent hover:underline px-2 py-1"
      aria-label={
        cruxId ? `${count} need tending` : `Tending${count ? `, ${count} need tending` : ''}`
      }
    >
      {cruxId ? (
        `${count} need tending`
      ) : (
        <>
          Tending
          {count > 0 && (
            <span className="ml-1 rounded bg-accent-muted px-1.5" title="Needs tending">
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
