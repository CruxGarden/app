import { useEffect, useState } from 'react';
import { myGardens, shareIntoGarden, type MyGarden } from '@/api/gardens';
import { Button } from '@/components/ui';
import { PaneSection, PaneHint, PaneNote } from './pane-ui';

/**
 * Share pane → Gardens (GARDEN-MEMBERS-PLAN): put this shared crux on the
 * shelf of a garden the person belongs to — the garden's own share function,
 * called as them.
 */
export default function GardenShelfSection({
  cruxId,
  title,
  url,
}: {
  cruxId: string;
  title: string;
  url: string;
}) {
  const [gardens, setGardens] = useState<MyGarden[]>([]);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    myGardens()
      .then((g) => {
        if (!live) return;
        const active = g.filter((x) => x.membership?.status === 'active' && x.cruxId !== cruxId);
        setGardens(active);
        setChosen((c) => c || active[0]?.cruxId || '');
      })
      .catch(() => live && setGardens([]));
    return () => {
      live = false;
    };
  }, [cruxId]);
  if (gardens.length === 0) return null;
  const share = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await shareIntoGarden(chosen, { cruxId, title, url });
      setNote(
        `On the shelf of "${gardens.find((g) => g.cruxId === chosen)?.title ?? 'the garden'}".`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PaneSection label="Gardens" data-testid="garden-shelf-section">
      <div className="flex flex-col gap-2">
        <PaneHint align="left">Put this crux on the shelf of a garden you belong to.</PaneHint>
        <div className="flex gap-2">
          <select
            aria-label="Garden"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="flex-1 h-8 px-2 rounded-[var(--radius-sm)] bg-input border border-input-border text-text text-xs"
          >
            {gardens.map((g) => (
              <option key={g.cruxId} value={g.cruxId}>
                {g.title || 'A garden'} · @{g.authorUsername}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={busy || !chosen} onClick={() => void share()}>
            Share here
          </Button>
        </div>
        {note && (
          <span role="status" className="text-xxs text-text-muted">
            {note}
          </span>
        )}
        {error && <PaneNote tone="error">{error}</PaneNote>}
      </div>
    </PaneSection>
  );
}
