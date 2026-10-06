import * as billing from '@/api/billing';
import { useAuthStore } from '@/stores/authStore';
import { notifyUsageChanged } from '@/lib/usage-events';
import { subscribeDeepLinks } from './deep-links';

/**
 * The checkout page hands the person back with a crux-garden:// billing link
 * (ADR 0085). The link proves nothing about payment; it only says
 * "look now". A mounted Plan settings section claims it and re-checks through
 * its own session; otherwise the plan is synced here so the allowance and
 * limits follow without waiting for the next focus.
 */
export interface BillingReturn {
  status: 'success' | 'cancel';
  sessionId?: string;
}
/** Return true to claim the return (the claimant verifies the plan itself). */
type Claimant = (link: BillingReturn) => boolean;
const claimants = new Set<Claimant>();

export function onBillingReturn(claimant: Claimant): () => void {
  claimants.add(claimant);
  return () => {
    claimants.delete(claimant);
  };
}

export async function handleBillingReturn(
  link: BillingReturn,
  sync: () => Promise<unknown> = () => billing.sync(),
): Promise<'claimed' | 'synced' | 'signed-out' | 'failed'> {
  for (const claimant of [...claimants]) if (claimant(link)) return 'claimed';
  if (!useAuthStore.getState().isAuthenticated) return 'signed-out';
  try {
    await sync();
    return 'synced';
  } catch {
    return 'failed';
  } finally {
    notifyUsageChanged();
  }
}

let started = false;
export function startBillingReturnLinks(): void {
  if (started) return;
  started = true;
  subscribeDeepLinks(
    (link) => {
      if (link.kind !== 'billing-return') return;
      void handleBillingReturn({ status: link.status, sessionId: link.sessionId });
    },
    { kinds: ['billing-return'] },
  );
}
