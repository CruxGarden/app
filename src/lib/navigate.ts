/**
 * Navigation from outside React (a tool executor, a store): the app's router
 * registers its `navigate` once at boot; services call `navigateTo`. Nothing
 * imports the router module itself, so there is no cycle.
 */
type Navigate = (path: string) => void | Promise<void>;
let current: Navigate | null = null;

export function registerNavigator(fn: Navigate): void {
  current = fn;
}

export function navigateTo(path: string): void {
  if (current) void current(path);
  else if (typeof window !== 'undefined') window.location.hash = path;
}
