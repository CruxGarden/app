import { useEffect, useState } from 'react';
import { useGardenContext } from '@/stores/gardenContext';
import { getSqliteClient } from '@/services/sqlite/client';
import {
  keepLookForGarden,
  lookEdited,
  onGardenMoodChange,
  readGardenMood,
  setGardenMoodMode,
  type GardenMood,
} from '@/services/garden-mood';

/**
 * One line: which Mood this Garden wears and where it comes from. Wearing any
 * card below makes it this Garden's own; the two quiet actions undo that.
 */
export default function GardenMoodLine() {
  const garden = useGardenContext((s) => s.garden);
  const [mood, setMood] = useState<GardenMood | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => onGardenMoodChange(() => setReload((n) => n + 1)), []);
  useEffect(() => {
    if (!garden) return;
    let active = true;
    void Promise.all([
      readGardenMood(garden.id),
      getSqliteClient().gardenMembership?.parents(garden.id) ?? [],
    ])
      .then(([next, parents]) => {
        if (!active) return;
        setMood(next);
        setParent(parents[0]?.title || (parents[0] ? 'its Garden' : null));
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [garden, reload]);

  if (!garden || !mood) return null;

  const act = (mode: 'inherit' | 'none') => {
    setBusy(true);
    setError(null);
    setGardenMoodMode(mode, garden.id)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const place = garden.title || 'This Garden';
  const worn = mood.source.mode === 'own' ? mood.name : 'the Default Mood';
  const from =
    mood.mode === 'inherit' && mood.source.title && mood.source.gardenId !== garden.id
      ? `from ${mood.source.title}`
      : mood.mode === 'none'
        ? 'chosen here'
        : null;

  return (
    <section aria-label="Garden Mood" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="text-xs text-text-muted flex-1 min-w-[200px]">
        <span className="text-text">{place}</span> wears <span className="text-text">{worn}</span>
        {from && <span>, {from}</span>}
      </p>
      {mood.mode !== 'inherit' && parent && !mood.isRoot && (
        <button
          type="button"
          disabled={busy}
          onClick={() => act('inherit')}
          className="text-xs text-accent hover:underline cursor-pointer "
        >
          Follow {parent}
        </button>
      )}
      {(mood.mode === 'own' || (mood.mode === 'inherit' && mood.source.mode === 'own')) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => act('none')}
          className="text-xs text-accent hover:underline cursor-pointer "
        >
          Use the Default Mood
        </button>
      )}
      {error && (
        <p role="alert" className="basis-full text-xxs text-error">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * Shown while the look was changed here: keep it as this Garden's own Mood,
 * or leave it — the Garden's Mood paints again when you come back.
 */
export function KeepLook() {
  const garden = useGardenContext((s) => s.garden);
  const [edited, setEdited] = useState(lookEdited);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onGardenMoodChange(() => setEdited(lookEdited())), []);
  if (!garden || !edited || !getSqliteClient().gardenMood) return null;
  const keep = () => {
    setBusy(true);
    setError(null);
    keepLookForGarden(garden.id)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <p
      data-testid="keep-look"
      className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-muted mb-3 shrink-0"
    >
      <span>Changed here — kept only while you stay.</span>
      <button
        type="button"
        disabled={busy}
        onClick={keep}
        className="text-accent hover:underline cursor-pointer "
      >
        Keep for {garden.title || 'this Garden'}
      </button>
      {error && <span className="text-error">{error}</span>}
    </p>
  );
}
