import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { MoodPackage } from '@/lib/moods/packages';
import { GARDEN_DARK } from '@/lib/moods';
import { previewMood } from './setup-actions';
import { SETUP_MOODS } from './setup-plan';
import { useSetupWizard } from './setup-store';
import { ReadyMark, Recommended } from './setup-ui';

/** Step 4 — a few bundled Moods; choosing one shows it behind the wizard at once. */
export default function StepMood() {
  const moodId = useSetupWizard((s) => s.moodId);
  const moodAtStart = useSetupWizard((s) => s.moodAtStart);
  const noAi = useSetupWizard((s) => s.noAi);
  const set = useSetupWizard((s) => s.set);
  const [moods, setMoods] = useState<MoodPackage[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void import('@/lib/moods/bundled-moods').then(({ BUNDLED_MOODS }) => {
      if (!live) return;
      setMoods(
        SETUP_MOODS.map((id) => BUNDLED_MOODS.find((m) => m.id === id)).filter(
          (m): m is MoodPackage => !!m,
        ),
      );
    });
    return () => {
      live = false;
    };
  }, []);
  const current = moodId ?? moodAtStart;

  const choose = async (id: string) => {
    set({ moodId: id });
    setError('');
    try {
      await previewMood(id, { cue: true });
    } catch {
      setError('That Mood could not be shown. Try another, or keep the current one.');
    }
  };

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Mood</legend>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {moods.map((pkg) => {
          const selected = current === pkg.id;
          return (
            <label
              key={pkg.id}
              data-mood={pkg.id}
              className={cn(
                'flex flex-col rounded-[var(--radius-sm)] border overflow-hidden cursor-pointer',
                'transition-[border-color,background-color] motion-press',
                'focus-within:ring-2 focus-within:ring-input-outline',
                selected
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-surface hover:border-action-button-border-hover hover:bg-action-button-hover',
              )}
            >
              <input
                type="radio"
                name="setup-mood"
                value={pkg.id}
                checked={selected}
                onChange={() => void choose(pkg.id)}
                className="sr-only"
              />
              <MoodThumb pkg={pkg} />
              <span className="flex items-center gap-1.5 px-2 py-1.5 min-w-0">
                <span
                  className={cn('text-xs truncate flex-1', selected ? 'text-accent' : 'text-text')}
                >
                  {pkg.name}
                </span>
                {pkg.id === SETUP_MOODS[0] && <Recommended />}
                {selected && <ReadyMark />}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-text-muted" aria-live="polite">
        {moodId
          ? `Now wearing ${moods.find((m) => m.id === moodId)?.name ?? 'your Mood'}. Try another, or carry on.`
          : noAi
            ? 'A Mood sets colours, background and sound. Dozens more wait in the Mood pane.'
            : 'A Mood sets colours, background, sound and your collaborator’s voice. Dozens more wait in the Mood pane.'}
      </p>
    </fieldset>
  );
}

/** The Mood's own picture, or its colours: a preview shows the Mood, not the app's theme. */
function MoodThumb({ pkg }: { pkg: MoodPackage }) {
  const background = pkg.bundled?.background;
  if (background)
    return (
      <img
        src={background}
        alt=""
        className="w-full aspect-[16/10] object-cover"
        draggable={false}
      />
    );
  const o = pkg.theme.overrides;
  const g = GARDEN_DARK as Record<string, string>;
  const c = (key: string) => o[key] || g[key] || 'transparent';
  return (
    <div
      aria-hidden
      className="w-full aspect-[16/10] flex items-end gap-1 p-2"
      style={{ background: c('bg') }}
    >
      <span className="h-2 flex-1 rounded-sm" style={{ background: c('panel') }} />
      <span className="h-2 w-4 rounded-sm" style={{ background: c('accent') }} />
    </div>
  );
}
