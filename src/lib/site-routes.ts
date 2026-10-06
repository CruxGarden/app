import { resolveRelativePath as normalizePath } from './artifact-path';
import { globToRegex } from './frontmatter';

/** A content collection with a served route: the glob's fixed prefix maps onto `routeBase`. */
export interface RoutedCollection {
  glob: string;
  routeBase?: string;
}

/**
 * Map a source file to its dev-server route: the Astro pages convention, or a
 * template's content collection (`src/content/wiki/**\/*.md` served at `/wiki/`
 * puts `src/content/wiki/notes/a.md` at `/wiki/notes/a`, `index` at the base).
 */
export function collectionRouteFor(
  filePath: string,
  collections: RoutedCollection[],
): string | null {
  const norm = normalizePath(filePath);
  for (const collection of collections) {
    if (!collection.routeBase || !globToRegex(collection.glob).test(norm)) continue;
    const prefix = collection.glob.slice(0, collection.glob.indexOf('*'));
    if (!norm.startsWith(prefix)) continue;
    let route = norm.slice(prefix.length).replace(/\.(astro|md|mdx|html)$/, '');
    if (route === 'index' || route.endsWith('/index')) route = route.slice(0, -'index'.length);
    return (collection.routeBase.replace(/\/$/, '') + '/' + route).replace(/\/$/, '') || '/';
  }
  return null;
}

export function siteRouteFor(filePath: string, collections: RoutedCollection[] = []): string {
  const norm = normalizePath(filePath);
  const collectionRoute = collectionRouteFor(norm, collections);
  if (collectionRoute !== null) return collectionRoute;
  const match = norm.match(/^src\/pages\/(.+)$/);
  if (!match) return '/';
  let route = match[1]!.replace(/\.(astro|md|mdx|html)$/, '');
  if (route === 'index' || route.endsWith('/index')) route = route.slice(0, -'index'.length);
  return '/' + route.replace(/\/$/, '');
}
