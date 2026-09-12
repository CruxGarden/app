import React, { createContext, useContext, useMemo, useState, useEffect, forwardRef } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
type Destination = string | { pathname?: string; query?: Record<string, string | string[]> };
const eventsMap = new Map<string, Set<() => void>>();
const events = {
  on(name: string, fn: () => void) {
    if (!eventsMap.has(name)) eventsMap.set(name, new Set());
    eventsMap.get(name)!.add(fn);
  },
  off(name: string, fn: () => void) {
    eventsMap.get(name)?.delete(fn);
  },
};
function url(value: Destination) {
  if (typeof value === 'string') return value;
  const search = new URLSearchParams();
  Object.entries(value.query ?? {}).forEach(([key, value]) =>
    (Array.isArray(value) ? value : [value]).forEach((v) => search.append(key, v)),
  );
  return `${value.pathname ?? location.hash.slice(1).split('?')[0]}${search.size ? '?' + search : ''}`;
}
let navigationGuard: (() => Promise<void>) | undefined;
export const setNavigationGuard = (guard: () => Promise<void>) => {
  navigationGuard = guard;
};
async function navigate(value: Destination, replace = false) {
  if (navigationGuard) {
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await navigationGuard();
    } catch {
      return false;
    }
  }

  eventsMap.get('routeChangeStart')?.forEach((fn) => fn());
  const target = url(value);
  if (!target.startsWith('/') || target.startsWith('//'))
    throw new Error('Only local routes are supported');
  if (replace) {
    history.replaceState(null, '', '#' + target);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else location.hash = target;
  return Promise.resolve(true);
}
function makeRoute(path: string) {
  const parsed = new URL(path, location.origin);
  const parts = parsed.pathname.split('/');
  const params =
    parts[1] === 'boards' && parts[2]
      ? { boardId: parts[2] }
      : parts[1] === 'cards' && parts[2]
        ? { cardId: parts[2] }
        : {};
  const query: Record<string, string | string[]> = { ...params };
  for (const key of parsed.searchParams.keys()) {
    const values = parsed.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0];
  }
  return {
    params,
    searchParams: parsed.searchParams,
    query,
    pathname: parsed.pathname,
    asPath: path,
    isReady: true,
    events,
    push: (v: Destination) => navigate(v),
    replace: (v: Destination) => navigate(v, true),
    back: async () => {
      if (navigationGuard) {
        try {
          await navigationGuard();
        } catch {
          return;
        }
      }
      history.back();
    },
    prefetch: async () => undefined,
  };
}
const Context = createContext<ReturnType<typeof makeRoute> | null>(null);
export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(location.hash.slice(1) || '/boards');
  useEffect(() => {
    const update = () => setPath(location.hash.slice(1) || '/boards');
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  const route = useMemo(() => makeRoute(path), [path]);
  return <Context.Provider value={route}>{children}</Context.Provider>;
}
export function useRouter() {
  const route = useContext(Context);
  if (!route) throw new Error('Missing local router');
  return route;
}
export const useParams = () => useRouter().params;
export const useSearchParams = () => useRouter().searchParams;
export const usePathname = () => useRouter().pathname;
export const Link = forwardRef<
  HTMLAnchorElement,
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    href: Destination;
    prefetch?: boolean;
    replace?: boolean;
  }
>(({ href, onClick, prefetch: _prefetch, replace, ...props }, ref) => (
  <a
    {...props}
    ref={ref}
    href={'#' + url(href)}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && event.button === 0) {
        event.preventDefault();
        void navigate(href, replace);
      }
    }}
  />
));
export default Link;
