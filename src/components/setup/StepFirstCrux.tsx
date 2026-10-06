import { useEffect, useState } from 'react';
import { Button, Input, Select, SectionLabel, linkClass } from '@/components/ui';
import { moodName, setupStartingPoints } from './setup-actions';
import { HOME_PAGE_TEMPLATE, needChoice, type CatalogEntry, type SetupStepId } from './setup-plan';
import { useSetupWizard } from './setup-store';
import { aiDecision } from './setup-finish';
import { useSetting } from '@/hooks/useSetting';
import { SettingsKey } from '@/lib/constants';
import WorkspacePreview from './WorkspacePreview';

function defaultName(entry: CatalogEntry): string {
  return entry.id === HOME_PAGE_TEMPLATE
    ? 'Hello, world'
    : entry.id === 'blank'
      ? 'My Crux'
      : entry.label;
}

/** Choose the first project and see its workspace before entering it. */
export default function StepFirstCrux({
  busy,
  onCreate,
  onNotNow,
  onSave,
  onBack,
}: {
  busy: boolean;
  onCreate: (entry: CatalogEntry) => void;
  onNotNow: () => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const choices = useSetupWizard();
  const set = choices.set;
  const currentAi = useSetting(SettingsKey.AiEnabled);
  const aiEnabled = aiDecision(choices, currentAi) ?? currentAi === 'true';
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [retry, setRetry] = useState(0);
  const startKind = choices.startKind ?? (choices.advancedMode ? 'template' : 'guided');
  const entry =
    catalog === null
      ? null
      : startKind === 'empty'
        ? catalog.find((e) => e.id === 'blank')
        : (catalog.find((e) => e.id === choices.templateId) ??
          catalog.find((e) => e.id !== 'blank'));
  const [mood, setMood] = useState('');
  const offerCrux = choices.mode === 'first' || choices.wantsCrux;
  const preferred = needChoice(choices.need ?? 'exploring')?.templates ?? [];

  useEffect(() => {
    let live = true;
    setCatalog(null);
    setCatalogError(false);
    void setupStartingPoints(choices.need)
      .then((found) => {
        if (live) setCatalog(found.filter((e) => choices.advancedMode || e.id !== 'tool-starter'));
      })
      .catch(() => {
        if (live) setCatalogError(true);
      });
    return () => {
      live = false;
    };
  }, [choices.need, choices.advancedMode, retry]);
  useEffect(() => {
    if (entry && !useSetupWizard.getState().cruxTitleEdited) set({ cruxTitle: defaultName(entry) });
  }, [entry, set]);
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
    { step: 'need', label: 'Making', value: needChoice(choices.need)?.label ?? 'Exploring' },
    { step: 'need', label: 'Advanced Mode', value: choices.advancedMode ? 'On' : 'Off' },
    {
      step: 'garden',
      label: 'Garden',
      value: `${choices.gardenName.trim() || 'My Garden'}${choices.username.trim() ? ` · @${choices.username.trim()}` : ''}${choices.photo ? ' · with your photo' : ''}`,
    },
    {
      step: 'ai',
      label: choices.noAi ? 'Working' : 'Collaborators',
      value: choices.noAi
        ? 'By hand'
        : aiEnabled
          ? 'Collaboration panel on'
          : 'Add a collaborator later in Settings',
    },
    { step: 'mood', label: 'Mood', value: mood || '…' },
  ];
  const options = (recommended: boolean) =>
    (catalog ?? [])
      .filter((e) => e.id !== 'blank' && preferred.includes(e.id) === recommended)
      .map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ));

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div
        className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 pb-1"
        data-testid="setup-ready-scroll"
      >
        <fieldset disabled={busy} className="flex flex-col gap-4 min-w-0">
          <legend className="sr-only">Your workspace choices</legend>
          {offerCrux &&
            (catalogError ? (
              <div role="alert" className="space-y-2">
                <p className="text-sm text-error">
                  Starting points could not be loaded. Your choices are still here.
                </p>
                <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
                  Try again
                </Button>
              </div>
            ) : catalog === null ? (
              <p role="status" className="text-sm text-text-muted">
                Finding a good place to start…
              </p>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  How would you like to start?
                  <Select
                    aria-label="How would you like to start?"
                    value={startKind}
                    onChange={(e) =>
                      set({ startKind: e.target.value as 'guided' | 'template' | 'empty' })
                    }
                  >
                    <option value="guided">Walk me through it</option>
                    <option value="template">Start with a template</option>
                    <option value="empty">Start with an empty Crux</option>
                  </Select>
                </label>
                {startKind !== 'empty' && (
                  <label className="flex flex-col gap-1.5 text-sm">
                    Starting point
                    <Select
                      aria-label="Starting point"
                      value={entry?.id ?? ''}
                      onChange={(e) => set({ templateId: e.target.value })}
                    >
                      {options(true).length > 0 && (
                        <optgroup label="For your interests">{options(true)}</optgroup>
                      )}
                      {options(false).length > 0 && (
                        <optgroup label="Explore something else">{options(false)}</optgroup>
                      )}
                    </Select>
                  </label>
                )}
                {entry ? (
                  <>
                    <div
                      className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2.5"
                      data-testid="setup-starting-point"
                      data-template={entry.id}
                    >
                      <div className="text-sm font-medium text-text">
                        {entry.id === 'blank' ? 'Empty Crux' : entry.label}
                      </div>
                      <p className="text-xs text-text-muted mt-1">{entry.description}</p>
                      <p className="text-xs text-text-muted mt-2">
                        {startKind === 'guided'
                          ? 'Your Crux will open with tips for your first activity. Try things at your own pace; you can fold the tips away any time.'
                          : startKind === 'empty'
                            ? 'A blank project with no example content or walkthrough. Choose a template if you’d like something to try first.'
                            : 'A template is a ready-made example you can change. Your edits save automatically.'}
                      </p>
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <SectionLabel tone="muted">Name</SectionLabel>
                      <Input
                        value={choices.cruxTitle}
                        maxLength={200}
                        onChange={(e) => set({ cruxTitle: e.target.value, cruxTitleEdited: true })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing && !busy) {
                            e.preventDefault();
                            onCreate(entry);
                          }
                        }}
                      />
                    </label>
                    <WorkspacePreview
                      templateId={entry.id}
                      need={choices.need}
                      advancedMode={choices.advancedMode}
                      aiEnabled={aiEnabled}
                    />
                  </>
                ) : (
                  <p className="text-sm text-text-muted">
                    No starting point is available in this build. You can go to Home and add one
                    later.
                  </p>
                )}
              </>
            ))}
          <details
            data-testid="setup-summary"
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2.5"
            open={!offerCrux}
          >
            <summary className="text-sm font-medium text-text cursor-pointer">
              Review workspace preferences
            </summary>
            <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 text-sm mt-3">
              {rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-xs text-text-muted self-center">{row.label}</dt>
                  <dd
                    className="text-text min-w-0 break-words"
                    data-summary={row.label === 'Advanced Mode' ? 'advanced-mode' : row.step}
                  >
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
          </details>
          {!offerCrux && (
            <p className="text-sm text-text-muted">
              Save these preferences for your workspace, or start a new Crux with them. Your
              existing Cruxes keep their layouts.
            </p>
          )}
        </fieldset>
      </div>
      <div
        className="shrink-0 flex flex-wrap items-center gap-2 border-t border-border pt-3"
        data-testid="setup-ready-actions"
      >
        <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}>
          Back
        </Button>
        <span className="flex-1" />
        {offerCrux ? (
          <>
            <Button variant="ghost" size="sm" onClick={onNotNow} disabled={busy}>
              {choices.mode === 'first' ? 'Go to Home instead' : 'Save without a new Crux'}
            </Button>
            <Button onClick={() => entry && onCreate(entry)} disabled={!entry} loading={busy}>
              Create &amp; open
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => set({ wantsCrux: true })}>
              Start a new Crux too
            </Button>
            <Button onClick={onSave} loading={busy}>
              Save changes
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
