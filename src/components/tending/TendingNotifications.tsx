import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTendingRows } from '@/stores/tendingStore';
import {
  createAttentionDelivery,
  initTendingNotifications,
  useTendingNotifications,
} from '@/services/tending-notifications';
import { tendingPath, validateTendingTarget } from '@/services/tending-actions';
import { initAlerts, raiseAlert, resolveAlertsByKey, useAlerts } from '@/services/alerts';
import { playCue } from '@/services/cues';
import { setScheduledCruxSource, startScheduler } from '@/services/schedules';
import { setActionRuntime } from '@/services/schedule-actions';
import { emitGardenEvent } from '@/services/garden-events';
import { initDockedMode } from '@/services/desktop';
import { useGardenStore } from '@/stores/gardenStore';

const nextAttention = createAttentionDelivery();
export default function TendingNotifications() {
  const rows = useTendingRows();
  const enabled = useTendingNotifications((s) => s.enabled);
  const navigate = useNavigate();
  useEffect(() => {
    initTendingNotifications();
    initAlerts();
    // Nudges read the garden; the ticker reconciles at once and every half minute.
    setScheduledCruxSource(() =>
      useGardenStore
        .getState()
        .allCruxes.map((c) => ({ id: c.id, title: c.title ?? 'Untitled', updated: c.updated })),
    );
    setActionRuntime({
      cruxTitle: (id) => useGardenStore.getState().allCruxes.find((c) => c.id === id)?.title ?? id,
    });
    void initDockedMode();
    const stop = startScheduler();
    // Anything scheduled for "the app opens" fires once the ticker is listening.
    emitGardenEvent('launch');
    return stop;
  }, []);
  useEffect(() => {
    // Every open Tending alert whose decision is no longer pending is done.
    const live = new Set<string>();
    for (const row of rows)
      for (const attention of row.state.attention) live.add(`tending:${row.id}:${attention.id}`);
    const stale = useAlerts
      .getState()
      .alerts.filter((a) => a.kind === 'tending' && a.state !== 'done' && !live.has(a.key))
      .map((a) => a.key);
    if (stale.length) resolveAlertsByKey(stale);
    const notices = nextAttention(rows);
    for (const notice of notices) {
      raiseAlert({
        key: `tending:${notice.id}`,
        kind: 'tending',
        title: `${notice.row.cruxTitle} · ${notice.row.title}`,
        body: notice.reason,
        cruxId: notice.row.cruxId,
        target: notice.target,
      });
    }
    if (notices.length) void playCue('alert');
    for (const notice of notices) {
      if (!enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted')
        continue;
      try {
        const notification = new Notification(`${notice.row.cruxTitle} · ${notice.row.title}`, {
          body: notice.reason,
          tag: notice.id,
        });
        notification.onclick = () => {
          notification.close();
          window.focus();
          try {
            validateTendingTarget(notice.target);
            navigate(tendingPath(notice.target), { state: { tending: notice.target } });
          } catch {
            navigate('/tending');
          }
        };
      } catch {
        /* In-app attention remains available when the OS refuses delivery. */
      }
    }
  }, [rows, enabled, navigate]);
  return null;
}
