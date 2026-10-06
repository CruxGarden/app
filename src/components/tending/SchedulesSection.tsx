import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useGardenContext } from '@/stores/gardenContext';
import { chipClass } from '@/components/ui/button-class';
import ScheduleForm from './ScheduleForm';
import { allMoods } from './schedule-moods';
import { useEffect, useMemo, useState } from 'react';
import { Button, Toggle, Panel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useGardenStore } from '@/stores/gardenStore';
import {
  AI_ACTIONS,
  AI_EVENTS,
  describeTrigger,
  formatRemaining,
  moodSchedulesEnabled,
  ownedBy,
  pauseTimer,
  removeSchedule,
  resetTimer,
  setMoodSchedulesEnabled,
  setScheduleEnabled,
  setScheduleSource,
  startTimer,
  timerRemaining,
  useSchedules,
  type Action,
  type Schedule,
} from '@/services/schedules';
import { describeCron } from '@/services/cron';
import { CUE_KINDS } from '@/services/cues';

function describeAction(a: Action, cruxTitle: (id?: string) => string): string {
  switch (a.kind) {
    case 'alert':
      return a.body?.trim() ? `Alert: ${a.body.trim()}` : 'Alert';
    case 'cue':
      return `Play ${typeof a.cue === 'string' ? (CUE_KINDS.find((k) => k.id === a.cue)?.label ?? a.cue) : 'your cue'}${
        a.times && a.times > 1 ? ` ×${a.times}` : ''
      }`;
    case 'notify':
      return 'Notify';
    case 'prompt':
      return `Prompt ${cruxTitle(a.cruxId)}`;
    case 'tool':
      return `${a.tool} on ${cruxTitle(a.cruxId)}`;
    case 'mood':
      return `Wear ${allMoods().find((m) => m.id === a.moodId)?.name ?? a.moodId}`;
    case 'fn':
      return `${a.name}() on ${cruxTitle(a.cruxId)}`;
  }
}

/** A running timer's phase and countdown; re-renders each second. */
function TimerControls({ s }: { s: Schedule }) {
  const [now, setNow] = useState(() => Date.now());
  const running = !!s.timer?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (s.trigger.kind !== 'timer') return null;
  const left = timerRemaining(s, new Date(now));
  const phase = s.timer ? s.trigger.phases[s.timer.phase] : null;
  return (
    <div className="flex items-center gap-2" data-testid="timer-controls">
      {left !== null && phase && (
        <span className="font-mono text-xs text-accent" data-testid="timer-remaining">
          {phase.label} {formatRemaining(left)}
          {s.trigger.rounds > 1 && (
            <span className="text-text-muted">
              {' '}
              · round {(s.timer?.round ?? 0) + 1}/{s.trigger.rounds}
            </span>
          )}
        </span>
      )}
      {running ? (
        <Button size="sm" variant="secondary" onClick={() => pauseTimer(s.id)}>
          Pause
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => startTimer(s.id)}
          disabled={!s.enabled}
        >
          {s.timer ? 'Resume' : 'Start'}
        </Button>
      )}
      {s.timer && (
        <Button size="sm" variant="ghost" onClick={() => resetTimer(s.id)}>
          Reset
        </Button>
      )}
    </div>
  );
}

export default function SchedulesSection() {
  const all = useSchedules((s) => s.schedules);
  // The Garden in front's own schedules.
  const gardenId = useGardenContext((s) => s.garden?.id);
  // With AI tools off, a schedule shows only what it can still do: its prompts
  // and tool calls wait (the runner skips them), and one made only of those is
  // not listed until they are back on.
  const aiEnabled = useAiEnabled();
  const schedules = useMemo(
    () =>
      all
        .filter((s) => ownedBy(s, gardenId))
        .filter(
          (s) =>
            aiEnabled ||
            ((s.actions.length === 0 || s.actions.some((a) => !AI_ACTIONS.has(a.kind))) &&
              !(s.trigger.kind === 'event' && AI_EVENTS.has(s.trigger.event))),
        )
        .map((s) =>
          aiEnabled ? s : { ...s, actions: s.actions.filter((a) => !AI_ACTIONS.has(a.kind)) },
        ),
    [all, gardenId, aiEnabled],
  );
  const cruxes = useGardenStore((s) => s.allCruxes);
  const cruxTitle = (id?: string) => cruxes.find((c) => c.id === id)?.title ?? 'a Crux';
  const [adding, setAdding] = useState(false);
  const [moodsOn, setMoodsOn] = useState(moodSchedulesEnabled);

  return (
    <Panel
      as="section"
      aria-label="Schedules"
      data-testid="schedules"
      padding="sm"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-heading">Schedules</h2>
          <p className="text-xs text-text-muted">
            Set a reminder or repeat an activity at a time you choose. Schedules run while the app
            is open, including docked mode. If the app was closed when something was due, it tells
            you when you return. Advanced Mode adds custom timing rules and tools.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Schedule…'}
        </Button>
      </div>

      {adding && (
        <ScheduleForm gardenId={gardenId} cruxes={cruxes} onDone={() => setAdding(false)} />
      )}

      {schedules.some((s) => s.source === 'mood') && (
        <div className="flex items-center justify-between gap-2 text-xs" data-testid="mood-switch">
          <span className="text-text-muted">
            Schedules the worn Mood brings along run too. They go when the Mood goes.
          </span>
          <Toggle
            checked={moodsOn}
            onChange={(v) => {
              setMoodSchedulesEnabled(v);
              setMoodsOn(v);
            }}
            label="Let the Mood schedule"
          />
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-xs text-text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="divide-y divide-border">
          {schedules.map((s) => (
            <li
              key={s.id}
              data-testid="schedule"
              data-kind={s.trigger.kind}
              data-source={s.source ?? 'garden'}
              className={cn(
                'flex flex-wrap items-center gap-3 py-2',
                s.source === 'mood' && !moodsOn && 'opacity-[var(--inactive-opacity)]',
              )}
            >
              <div className="flex-1 min-w-48">
                <p className="text-sm text-text">
                  {s.title}
                  {s.source === 'mood' && (
                    <button
                      type="button"
                      title="From the worn Mood — click to keep it in the garden instead"
                      onClick={() => setScheduleSource(s.id, undefined)}
                      className={chipClass(
                        true,
                        'ml-2 h-5 px-1.5 align-middle text-3xs uppercase tracking-wider',
                      )}
                    >
                      Mood
                    </button>
                  )}
                </p>
                <p className="text-2xs text-text-muted">
                  {s.trigger.kind === 'cron'
                    ? describeCron(s.trigger.expr)
                    : describeTrigger(s.trigger, cruxTitle)}
                  {s.next && s.enabled && (
                    <>
                      {' '}
                      · next{' '}
                      {new Date(s.next).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </>
                  )}
                </p>
                <p className="text-2xs text-text-muted">
                  {s.actions.map((a) => describeAction(a, cruxTitle)).join(' · ')}
                </p>
              </div>
              {s.trigger.kind === 'timer' && <TimerControls s={s} />}
              <Toggle
                checked={s.enabled}
                onChange={(v) => setScheduleEnabled(s.id, v)}
                label={s.enabled ? 'On' : 'Off'}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove schedule ${s.title}`}
                onClick={() => removeSchedule(s.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
