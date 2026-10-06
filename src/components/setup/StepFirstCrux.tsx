import { useEffect, useState } from 'react';
import { Button, Input, SectionLabel, linkClass } from '@/components/ui';
import { SproutIcon } from '@/components/ui/icons';
import { moodName, suggestedStartingPoint } from './setup-actions';
import { HOME_PAGE_TEMPLATE, needChoice, type CatalogEntry, type SetupStepId } from './setup-plan';
import { useSetupWizard } from './setup-store';

/** The name a starting point suggests, as Add Crux and the first home page always used. */
function defaultName(entry: CatalogEntry): string {
  return entry.id === HOME_PAGE_TEMPLATE ? 'Hello, world' : entry.label;
}

/**
 * Step 5 — "Here's your garden": every choice with an Edit link, then the
 * suggested first Crux, named, and Create & open. Running setup again keeps
 * the Crux folded away unless the person asks for one.
 */
export default function StepFirstCrux({
  busy,
  onCreate,
  onChooseOther,
  onNotNow,
  onSave,
}: {
  busy: boolean;
  onCreate: (entry: CatalogEntry) => void;
  onChooseOther: () => void;
  onNotNow: () => void;
  /** Again: apply the changes without making anything. */
  onSave: () => void;
}) {
  const choices = useSetupWizard();
  const set = choices.set;
  const [entry, setEntry] = useState<CatalogEntry | null | undefined>(undefined);
  const [mood, setMood] = useState('');
  const offerCrux = choices.mode === 'first' || choices.wantsCrux;

  useEffect(() => {
    let live = true;
    void suggestedStartingPoint(choices.need).then((found) => {
      if (!live) return;
      setEntry(found ?? null);
      if (found && !useSetupWizard.getState().cruxTitleEdited)
        set({ cruxTitle: defaultName(found) });
    });
    return () => {
      live = false;
    };
  }, [choices.need, set]);
  const moodId = choices.moodId ?? choices.moodAtStart;
  useEffect(() => {
    let live = true;
    void moodName(moodId).then((name) => {
      if (live) setMood(name);
    });
    return () => {
      live = false;
    };
  }, [moodId]);

  const rows: { step: SetupStepId; label: string; value: string }[] = [
    {
      step: 'need',
      label: 'Making',
      value: needChoice(choices.need)?.label ?? 'Not decided yet · anything goes',
    },
    {
      step: 'garden',
      label: 'Garden',
      value: `${choices.gardenName.trim() || 'My Garden'}${
        choices.username.trim() ? ` · @${choices.username.trim()}` : ''
      }${choices.photo ? ' · with your photo' : ''}`,
    },
    {
      step: 'ai',
      label: choices.noAi ? 'Working' : 'Collaborators',
      value: choices.noAi
        ? 'By hand'
        : choices.aiUsed
          ? 'Set up and ready to help'
          : 'None yet · add one any time in Settings',
    },
    { step: 'mood', label: 'Mood', value: mood || '…' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Here's your garden"
        data-testid="setup-summary"
        className="rounded-[var(--radius-sm)] border border-accent bg-surface px-3 py-2.5"
      >
        <div className="flex items-center gap-2 mb-2 text-accent">
          <SproutIcon size={16} />
          <span className="text-sm font-medium">Here&rsquo;s your garden</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 text-sm">
          {rows.map((row) => (
            <div key={row.step} className="contents">
              <dt className="text-xs text-text-muted self-center">{row.label}</dt>
              <dd className="text-text min-w-0 truncate" data-summary={row.step}>
                {row.value}
              </dd>
              <dd className="self-center">
                <button
                  type="button"
                  className={linkClass('text-xs')}
                  aria-label={`Edit ${row.label.toLowerCase()}`}
                  onClick={() => choices.goTo(row.step)}
                >
                  Edit
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {offerCrux ? (
        entry === undefined ? (
          <p className="text-sm text-text-muted">Finding a good place to start…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {entry ? (
              <>
                <div
                  className="rounded-[var(--radius-sm)] border border-border px-3 py-2.5"
                  data-testid="setup-starting-point"
                  data-template={entry.id}
                >
                  <SectionLabel tone="muted">Your first Crux</SectionLabel>
                  <div className="mt-1 text-sm font-medium text-text">{entry.label}</div>
                  <p className="text-xs text-text-muted">{entry.description}</p>
                </div>
                <label className="flex flex-col gap-1.5">
                  <SectionLabel tone="muted">Name</SectionLabel>
                  <Input
                    value={choices.cruxTitle}
                    onChange={(e) => set({ cruxTitle: e.target.value, cruxTitleEdited: true })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !busy) {
                        e.preventDefault();
                        onCreate(entry);
                      }
                    }}
                    maxLength={200}
                    autoFocus
                  />
                </label>
              </>
            ) : (
              <p className="text-sm text-text-muted">Choose how you would like to start.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {entry && (
                <Button onClick={() => onCreate(entry)} loading={busy}>
                  Create &amp; open
                </Button>
              )}
              <Button variant="secondary" onClick={onChooseOther} disabled={busy}>
                Choose something else
              </Button>
              <Button variant="ghost" onClick={onNotNow} disabled={busy}>
                Not now
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} loading={busy}>
            Save changes
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => set({ wantsCrux: true })}>
            Start a new Crux too
          </Button>
        </div>
      )}
    </div>
  );
}
