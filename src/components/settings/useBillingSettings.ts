import { useEffect, useRef, useState } from 'react';
import * as billing from '@/api/billing';
import { openWeb } from '@/services/desktop';
import { useAuthStore } from '@/stores/authStore';
import { notifyUsageChanged } from '@/lib/usage-events';
import { apiBaseUrl } from '@/api/client';
import { BillingSettingsSession, emptyBillingSettings } from './billing-session';

export function useBillingSettings(accountId: string) {
  const [state, setState] = useState(emptyBillingSettings);
  const session = useRef<BillingSettingsSession | null>(null);
  useEffect(() => {
    const origin = apiBaseUrl();
    const controller = new BillingSettingsSession(
      {
        api: billing,
        open: (url) => (billing.isBillingUrl(url) ? openWeb(url) : Promise.resolve(false)),
        usageChanged: notifyUsageChanged,
        isCurrent: () =>
          useAuthStore.getState().isAuthenticated &&
          useAuthStore.getState().account?.id === accountId &&
          apiBaseUrl() === origin,
      },
      setState,
    );
    session.current = controller;
    setState(emptyBillingSettings());
    void controller.load();
    const focus = () => void controller.refresh();
    window.addEventListener('focus', focus);
    return () => {
      controller.dispose();
      window.removeEventListener('focus', focus);
      if (session.current === controller) session.current = null;
    };
  }, [accountId]);
  return { ...state, session };
}
