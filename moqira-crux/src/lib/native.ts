// Native window menus are supplied by Crux Garden, not a nested Tauri runtime.
export async function open(_options: unknown): Promise<string | null> {
  return null;
}
export async function save(_options: unknown): Promise<string | null> {
  return null;
}
export async function listen<T>(_name: string, _callback: (event: { payload: T }) => void) {
  return () => {};
}
export function getCurrentWindow() {
  return { startDragging: async () => {}, destroy: async () => {} };
}
