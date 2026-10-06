import type { Artifact, Crux } from '@/api/types';
import { normalizePath, pathOf, isWorkspaceThumbnail, isAgentFile } from './artifact-path';
import { isSiteCrux } from '@/services/site';
import { collectionRouteFor, siteRouteFor, type RoutedCollection } from './site-routes';
import type { ContentModel } from '@/templates';

/** Entry selection is by portable path, never by a Working Copy's Artifact ID. */
export function entryCandidates(
  artifacts: Artifact[],
  collections: RoutedCollection[] = [],
): Artifact[] {
  const site = isSiteCrux(artifacts);
  return artifacts
    .filter((a) => {
      const path = normalizePath(pathOf(a));
      if (isWorkspaceThumbnail(path) || isAgentFile(path)) return false;
      if (site)
        return (
          /^src\/pages\/(?!.*\[).*\.(astro|html|md|mdx)$/i.test(path) ||
          collectionRouteFor(path, collections) !== null
        );
      return /\.(html?|md|svg|png|jpe?g|gif|webp)$/i.test(path);
    })
    .sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
}

export function workshopEntry(
  crux: Crux | null,
  artifacts: Artifact[],
  entryFile = crux?.meta?.settings?.entryFile,
) {
  const collections = (crux?.meta?.contentModel as ContentModel | undefined)?.collections ?? [];
  const candidates = entryCandidates(artifacts, collections);
  const homes = isSiteCrux(artifacts)
    ? candidates.filter((a) => siteRouteFor(pathOf(a), collections) === '/')
    : [];
  const configured = entryFile;
  if (configured) {
    return {
      artifact: candidates.find((a) => normalizePath(pathOf(a)) === configured) ?? null,
      missing: configured,
    };
  }
  const defaults = isSiteCrux(artifacts)
    ? ['src/pages/index.astro', 'src/pages/index.md', 'src/pages/index.mdx', 'src/pages/index.html']
    : ['index.html', 'index.htm', 'README.md', 'readme.md'];
  const artifact =
    defaults.map((p) => candidates.find((a) => normalizePath(pathOf(a)) === p)).find(Boolean) ??
    (homes.length === 1 ? homes[0] : null) ??
    (candidates.length === 1 ? candidates[0] : null) ??
    null;
  return { artifact, missing: null };
}
