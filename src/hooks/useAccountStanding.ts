import { useEffect, useState } from 'react';
import * as billingApi from '@/api/billing';
import { useAuthStore } from '@/stores/authStore';

/** Whether the hosted account is suspended (GET /account). Unknown stays null. */
export function useAccountStanding(accountId: string): billingApi.AccountStanding | null {
  const [standing, setStanding] = useState<billingApi.AccountStanding | null>(null);
  useEffect(() => {
    let current = true;
    setStanding(null);
    billingApi
      .accountStanding()
      .then((value) => {
        if (current && useAuthStore.getState().account?.id === accountId) setStanding(value);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [accountId]);
  return standing;
}
