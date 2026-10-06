import { getSetting, setSettingDurably } from './settings';

/** Installation-local delivery state, never a Garden relationship or portable content. */
export interface DeferredImport {
  id: string;
  ownerId: string;
  tool: string;
  input: Record<string, unknown>;
  state: 'queued' | 'dispatched' | 'complete' | 'uncertain' | 'failed' | 'dismissed';
  error?: string;
}
const key = (ownerId: string) => `cruxgarden:pending-open:${ownerId}`;
const listeners = new Set<() => void>();
const running = new Map<string, Promise<void>>();
const recovering = new Set<string>();
export const subscribeDeferredImports = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const notify = () => {
  for (const listener of listeners) listener();
};
export const deferredImportSnapshot = (ownerId: string) => getSetting(key(ownerId));
export const deferredImportRunning = (ownerId: string) => running.has(ownerId);
export function readDeferredImport(ownerId: string): DeferredImport | null {
  const raw = deferredImportSnapshot(ownerId);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DeferredImport;
    if (
      value.ownerId !== ownerId ||
      typeof value.id !== 'string' ||
      typeof value.tool !== 'string' ||
      !value.input ||
      typeof value.input !== 'object' ||
      !['queued', 'dispatched', 'complete', 'uncertain', 'failed', 'dismissed'].includes(
        value.state,
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
async function save(value: DeferredImport) {
  await setSettingDurably(key(value.ownerId), JSON.stringify(value));
  notify();
}
export async function queueDeferredImport(
  ownerId: string,
  tool: string,
  input: Record<string, unknown>,
) {
  if (readDeferredImport(ownerId) || running.has(ownerId))
    throw new Error('This Crux already has a file import. Finish it before starting another.');
  await save({
    id: crypto.randomUUID(),
    ownerId,
    tool,
    input: structuredClone(input),
    state: 'queued',
  });
}

/** Persist the dispatch boundary before calling a non-idempotent tool. Unknown
 * outcomes never replay automatically, including after a process restart.
 */
export function deliverDeferredImport(
  ownerId: string,
  ready: () => boolean,
  execute: (tool: string, input: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const active = running.get(ownerId);
  if (active) return active;
  const request = readDeferredImport(ownerId);
  if (recovering.has(ownerId) || !request || request.state !== 'queued' || !ready())
    return Promise.resolve();
  const operation = (async () => {
    let sent = false;
    try {
      await save({ ...request, state: 'dispatched', error: undefined });
      // The panel may have closed while the dispatch marker was being saved.
      if (!ready()) {
        await save({ ...request, state: 'queued' });
        return;
      }
      sent = true;
      await execute(request.tool, structuredClone(request.input));
      await save({ ...request, state: 'complete', error: undefined });
    } catch (error) {
      // Even a tool error or a failed completion write can follow a real effect.
      await save({
        ...request,
        state: sent ? 'uncertain' : 'failed',
        error: (error as Error).message,
      });
    }
  })().finally(() => {
    running.delete(ownerId);
    notify();
  });
  running.set(ownerId, operation);
  notify();
  return operation;
}

/** Explicit human/agent recovery only. The caller must inspect uncertain effects first. */
async function recover(ownerId: string, state: 'queued' | 'dismissed') {
  if (running.has(ownerId) || recovering.has(ownerId))
    throw new Error('The import is still running.');
  const request = readDeferredImport(ownerId);
  if (
    !request ||
    (state === 'queued' && !['uncertain', 'failed', 'dispatched'].includes(request.state))
  )
    throw new Error('There is no interrupted import to retry.');
  recovering.add(ownerId);
  try {
    await save({ ...request, state, error: undefined });
  } finally {
    recovering.delete(ownerId);
    notify();
  }
}
export const retryDeferredImport = (ownerId: string) => recover(ownerId, 'queued');
export const dismissDeferredImport = (ownerId: string) => recover(ownerId, 'dismissed');
