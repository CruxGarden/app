import type { Artifact, Crux } from '@/api/types';
import { normalizePath, pathOf, isWorkspaceThumbnail } from './artifact-path';
import { isSiteCrux } from '@/services/site';

/** Entry selection is by portable path, never by a Working Copy's Artifact ID. */
export function entryCandidates(artifacts: Artifact[]): Artifact[] {
  const site = isSiteCrux(artifacts);
  return artifacts
    .filter((a) => {
      const path = normalizePath(pathOf(a));
      if (isWorkspaceThumbnail(path) || /(^|\/)AGENTS\.md$/i.test(path)) return false;
      if (site) return /^src\/pages\/(?!.*\[).*\.(astro|html|md|mdx)$/i.test(path);
      return /\.(html?|md|svg|png|jpe?g|gif|webp)$/i.test(path);
    })
    .sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
}

export function workshopEntry(
  crux: Crux | null,
  artifacts: Artifact[],
  entryFile = crux?.meta?.settings?.entryFile,
) {
  const candidates = entryCandidates(artifacts);
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
    (candidates.length === 1 ? candidates[0] : null) ??
    null;
  return { artifact, missing: null };
}
