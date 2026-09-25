import { useEffect, useState } from 'react';
import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import { collectionsChanged } from '@/services/cruxspaces';
import { useGardenContext } from '@/stores/gardenContext';
import { cn } from '@/lib/cn';

/** What a Garden is for, under its name: read in place, edited in place. */
export default function GardenBrief({ gardenId }: { gardenId: string }) {
  const revision = useGardenContext((s) => s.revision);
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void getSqliteClient()
      .get<{ description: string | null }>('SELECT description FROM cruxes WHERE id = ?', [
        gardenId,
      ])
      .then((row) => live && setBrief(row?.description ?? ''))
      .catch(() => live && setBrief(''));
    return () => {
      live = false;
    };
  }, [gardenId, revision]);

  const save = (value: string) => {
    setDraft(null);
    const next = value.trim().slice(0, 8000);
    if (next === brief) return;
    const previous = brief;
    setBrief(next);
    setError('');
    void getServices()
      .crux.update(gardenId, { description: next })
      .then(() => collectionsChanged())
      .catch((e) => {
        setBrief(previous);
        setError((e as Error).message);
      });
  };

  if (draft !== null)
    return (
      <textarea
        autoFocus
        aria-label="Garden brief"
        rows={2}
        maxLength={8000}
        value={draft}
        placeholder="What this Garden is for"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(null);
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(draft);
        }}
        className="mt-1 w-full resize-none bg-transparent text-sm text-text border-b border-border focus:outline-none focus:border-input-border-active"
      />
    );
  return (
    <>
      <button
        type="button"
        aria-label={brief ? 'Edit Garden brief' : 'Add a Garden brief'}
        onClick={() => setDraft(brief)}
        className={cn(
          'block mt-0.5 text-left text-sm line-clamp-2 cursor-text',
          brief ? 'text-text-muted' : 'text-text-muted/50 hover:text-text-muted',
        )}
      >
        {brief || 'Add a brief'}
      </button>
      {error && (
        <p role="alert" className="text-xxs text-error">
          {error}
        </p>
      )}
    </>
  );
}
