import { createContext } from 'react';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand';
import type { CruxState } from './cruxStore';
import type { UIState } from './uiStore';

export interface WorkspaceStores {
  data: StoreApi<CruxState>;
  ui: StoreApi<UIState>;
}
export const WorkspaceContext = createContext<WorkspaceStores | null>(null);
export const workspaceSelection = createStore<{ active: WorkspaceStores | null }>(() => ({
  active: null,
}));

/** Async services share the same close boundary as store actions. */
export const workspaceOperations = new WeakMap<StoreApi<CruxState>, Set<Promise<unknown>>>();
export function trackWorkspacePromise<R>(
  data: StoreApi<CruxState>,
  operation: Promise<R>,
): Promise<R> {
  const owned = workspaceOperations.get(data);
  owned?.add(operation);
  void operation.finally(() => owned?.delete(operation)).catch(() => {});
  return operation;
}
export function trackWorkspaceOperation<T extends unknown[], R>(
  data: StoreApi<CruxState>,
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return (...args) => trackWorkspacePromise(data, fn(...args));
}
