import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useDismiss } from '@/hooks/useDismiss';
import IconButton from '@/components/ui/IconButton';
import { BellIcon } from '@/components/ui/icons';
import {
  useAlerts,
  openAlerts,
  snoozeAlert,
  doneAlert,
  alertAge,
  type Alert,
} from '@/services/alerts';
import { tendingPath, validateTendingTarget } from '@/services/tending-actions';

/**
 * The Alerts inbox (GARDEN-SCHEDULER-PLAN §2): one bell in the TopBar with
 * the count of what wants attention now, and a list behind it — newest
 * first — with Open, Snooze and Done. Open revalidates a Tending target the
 * way a desktop notification does, so a stale alert lands on Tending rather
 * than on a decision that no longer exists.
 */
export default function AlertsBell() {
  const alerts = useAlerts((s) => s.alerts);
  const open = openAlerts(alerts);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const close = useCallback(() => setShown(false), []);
  useDismiss(ref, close, shown);

  const go = (a: Alert) => {
    setShown(false);
    if (!a.target) {
      if (a.cruxId) navigate(`/c/${encodeURIComponent(a.cruxId)}`);
      return;
    }
    try {
      validateTendingTarget(a.target);
      navigate(tendingPath(a.target), { state: { tending: a.target } });
    } catch {
      navigate('/tending');
    }
  };
  const inHour = () => new Date(Date.now() + 60 * 60_000).toISOString();

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={open.length ? `Alerts, ${open.length} new` : 'Alerts'}
        size="sm"
        onClick={() => setShown((v) => !v)}
        active={shown}
        tooltip={{ label: 'Alerts' }}
        data-testid="alerts-bell"
        aria-expanded={shown}
        aria-haspopup="menu"
      >
        <BellIcon />
        {open.length > 0 && (
          <span
            data-testid="alerts-count"
            className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent text-on-accent text-3xs font-mono font-bold flex items-center justify-center"
          >
            {open.length > 99 ? '99+' : open.length}
          </span>
        )}
      </IconButton>
      {shown && (
        <div className="absolute left-0 top-full w-80 pt-2 z-50" data-testid="alerts-menu">
          <div className="bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown py-1 max-h-[60vh] overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="text-xs font-display font-medium text-text">Alerts</span>
              <span className="text-2xs font-mono text-text-muted">
                {open.length ? `${open.length} new` : 'nothing new'}
              </span>
            </div>
            {open.length === 0 && (
              <p className="px-3 py-4 text-xs text-text-muted">
                Nothing needs you right now. Tending shows everything that is growing.
              </p>
            )}
            {open.map((a) => (
              <div
                key={a.id}
                data-testid="alert"
                data-kind={a.kind}
                className="px-3 py-2 border-b border-border last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <button
                    onClick={() => go(a)}
                    className="text-left text-sm text-text hover:text-accent truncate cursor-pointer min-w-0"
                    title={a.title}
                  >
                    {a.title}
                  </button>
                  <span className="text-3xs font-mono text-text-muted shrink-0">
                    {alertAge(a.at)}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{a.body}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <button
                    onClick={() => go(a)}
                    className={cn(
                      'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)]',
                      'bg-accent-muted text-accent hover-bright cursor-pointer',
                    )}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => snoozeAlert(a.id, inHour())}
                    className="px-2 py-0.5 text-xxs font-mono text-text-muted hover:text-text cursor-pointer"
                  >
                    Snooze 1 h
                  </button>
                  <button
                    onClick={() => snoozeAlert(a.id, 'launch')}
                    className="px-2 py-0.5 text-xxs font-mono text-text-muted hover:text-text cursor-pointer"
                    title="Put it away until the next time you open the app"
                  >
                    Later
                  </button>
                  <button
                    onClick={() => doneAlert(a.id)}
                    className="ml-auto px-2 py-0.5 text-xxs font-mono text-text-muted hover:text-text cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
