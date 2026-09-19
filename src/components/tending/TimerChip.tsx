import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  formatRemaining,
  pauseTimer,
  runningTimers,
  timerRemaining,
  useSchedules,
} from '@/services/schedules';

/**
 * The countdown of a running timer (a pomodoro's Focus 24:59), in the
 * TopBar beside the bell. One chip per running timer; click goes to Tending
 * where the controls are, the pause glyph pauses in place.
 */
export default function TimerChip() {
  const schedules = useSchedules((s) => s.schedules);
  const running = runningTimers(schedules);
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running.length]);
  if (!running.length) return null;
  return (
    <div className="flex items-center gap-1" data-testid="timer-chips">
      {running.map((s) => {
        const phase = s.trigger.kind === 'timer' ? s.trigger.phases[s.timer!.phase]! : null;
        const left = timerRemaining(s, new Date(now)) ?? 0;
        return (
          <span
            key={s.id}
            data-testid="timer-chip"
            className={cn(
              'inline-flex items-center gap-1.5 h-6 pl-2 pr-1 rounded-full text-xxs font-mono',
              'bg-accent-muted text-accent',
            )}
          >
            <button
              onClick={() => navigate('/tending')}
              className="cursor-pointer hover:underline"
              title={s.title}
            >
              {phase?.label} {formatRemaining(left)}
            </button>
            <button
              onClick={() => pauseTimer(s.id)}
              aria-label={`Pause ${s.title}`}
              className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-accent/20 cursor-pointer"
            >
              <span className="block w-1.5 h-1.5 border-x-[1.5px] border-current" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
