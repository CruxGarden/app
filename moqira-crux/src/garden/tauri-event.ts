// Stands in for @tauri-apps/api/event: the app registers its menu actions with
// listen(); the Garden bar and flush raise them with emit().
type Handler = (event: { event: string; payload: unknown; id: number }) => void;
const handlers = new Map<string, Set<Handler>>();
let next = 1;
export async function listen<T>(event: string, handler: (event: { event: string; payload: T; id: number }) => void): Promise<() => void> {
  const set = handlers.get(event) ?? new Set<Handler>();
  set.add(handler as Handler);
  handlers.set(event, set);
  return () => {
    set.delete(handler as Handler);
  };
}
export async function once<T>(event: string, handler: (event: { event: string; payload: T; id: number }) => void): Promise<() => void> {
  const off = await listen<T>(event, (e) => {
    off();
    handler(e);
  });
  return off;
}
export function emit(event: string, payload?: unknown): Promise<void> {
  for (const handler of handlers.get(event) ?? []) handler({ event, payload, id: next++ });
  return Promise.resolve();
}
