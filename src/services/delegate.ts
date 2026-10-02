import { createWorkingCopyDelegate } from './delegate-working-copies';
import { useCruxStoreApi, type CruxState } from '@/stores/cruxStore';
import type { StoreApi } from 'zustand';

export interface DelegateContext {
  cruxId: string;
  model: string;
  apiKey: string;
  /** The parent job's signal — Stop aborts every worker. */
  signal: AbortSignal;
  /** The job the workers belong to. */
  jobId: string;
  /** Who requested parallel work. */
  requestedBy?: string;
}

/** Delegation uses ordinary API-owned Tasks and their review authority.
 * The retired browser snapshot implementation is intentionally absent. */
export function useDelegate() {
  return delegateFor(useCruxStoreApi());
}
const delegates = new WeakMap<StoreApi<CruxState>, ReturnType<typeof createWorkingCopyDelegate>>();
export function delegateFor(data: StoreApi<CruxState>) {
  let delegate = delegates.get(data);
  if (!delegate) {
    delegate = createWorkingCopyDelegate(data);
    delegates.set(data, delegate);
  }
  return delegate;
}
