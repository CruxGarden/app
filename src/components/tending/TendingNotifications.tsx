import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTendingRows } from '@/stores/tendingStore';
import {
  createAttentionDelivery,
  initTendingNotifications,
  useTendingNotifications,
} from '@/services/tending-notifications';
import { tendingPath, validateTendingTarget } from '@/services/tending-actions';

const nextAttention = createAttentionDelivery();
export default function TendingNotifications() {
  const rows = useTendingRows();
  const enabled = useTendingNotifications((s) => s.enabled);
  const navigate = useNavigate();
  useEffect(() => initTendingNotifications(), []);
  useEffect(() => {
    for (const notice of nextAttention(rows)) {
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
