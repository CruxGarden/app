import { useUIStore } from '@/stores/uiStore';
import { useTendingRows } from '@/stores/tendingStore';
import { attentionCount } from '@/services/tending-state';
import { buttonClass } from '@/components/ui/button-class';

export default function TendingLink({ cruxId }: { cruxId?: string }) {
  const rows = useTendingRows();
  const states = rows.filter((r) => !cruxId || r.cruxId === cruxId).map((r) => r.state);
  const count = attentionCount(states);
  if (cruxId && !count) return null;
  return (
    <button
      type="button"
      onClick={() => useUIStore.getState().openTending()}
      className={buttonClass(
        'ghost',
        'xs',
        cruxId
          ? 'text-accent'
          : 'px-2 text-sm font-display text-toolbar-text hover:text-toolbar-text',
      )}
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
            <span
              className="ml-0.5 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-accent-muted text-accent text-3xs font-mono"
              title="Needs tending"
            >
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}
