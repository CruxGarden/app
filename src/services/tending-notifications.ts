import { create } from 'zustand';
import { getSetting, setSetting } from './settings';
import type { TendingRow } from '@/stores/tendingStore';
import type { TendingTarget } from './tending-state';

const KEY = 'cruxgarden:tending-notifications';
export const useTendingNotifications = create<{ enabled: boolean; error: string }>(() => ({
  enabled: false,
  error: '',
}));
export function initTendingNotifications() {
  useTendingNotifications.setState({ enabled: getSetting(KEY) === 'true' });
}
export async function enableTendingNotifications(enabled: boolean) {
  try {
    if (
      enabled &&
      (typeof Notification === 'undefined' ||
        (await Notification.requestPermission()) !== 'granted')
    )
      throw new Error(
        'Desktop notifications are unavailable. Tending will still show every pending decision.',
      );
    setSetting(KEY, String(enabled));
    useTendingNotifications.setState({ enabled, error: '' });
  } catch (e) {
    useTendingNotifications.setState({ enabled: false, error: (e as Error).message });
  }
}
/** Bound notification history. Repeated observations or returning to a view do not notify again. */
export function createAttentionDelivery() {
  const seen = new Set<string>();
  return (rows: TendingRow[]) => {
    const pending: { row: TendingRow; reason: string; target: TendingTarget; id: string }[] = [];
    for (const row of rows)
      for (const attention of row.state.attention) {
        if (!row.state.lifetimeId) continue; // Restored metadata is not a new live transition.
        const id = `${row.id}:${attention.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        pending.push({
          row,
          reason: attention.reason,
          id,
          target: {
            copyId: row.id,
            cruxId: row.cruxId,
            lifetimeId: row.state.lifetimeId,
            runId: row.state.runId,
            attentionId: attention.id,
          },
        });
      }
    while (seen.size > 512) seen.delete(seen.values().next().value!);
    return pending;
  };
}
