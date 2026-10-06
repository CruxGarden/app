import { useEffect, useState } from 'react';
import * as billingApi from '@/api/billing';
import { onUsageChanged } from '@/lib/usage-events';
import { useAuthStore } from '@/stores/authStore';

type InvoiceState =
  | { status: 'loading' }
  | { status: 'ready'; invoices: billingApi.Invoice[] }
  | { status: 'unavailable' };

/** The account's invoices, re-read when the plan or usage changes. */
export function useInvoices(accountId: string | undefined): InvoiceState {
  const [state, setState] = useState<InvoiceState>({ status: 'loading' });
  useEffect(() => {
    setState({ status: 'loading' });
    if (!accountId) return;
    let current = true;
    const load = () =>
      billingApi
        .invoices()
        .then((invoices) => {
          if (current && useAuthStore.getState().account?.id === accountId)
            setState({ status: 'ready', invoices });
        })
        .catch((error: { response?: { status?: number } }) => {
          // An older server has no invoice route: there is simply no list.
          if (current)
            setState(
              error?.response?.status === 404
                ? { status: 'ready', invoices: [] }
                : { status: 'unavailable' },
            );
        });
    void load();
    const off = onUsageChanged(() => void load());
    return () => {
      current = false;
      off();
    };
  }, [accountId]);
  return state;
}
