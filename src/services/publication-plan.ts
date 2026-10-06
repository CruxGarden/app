import type { Artifact, Crux } from '@/api/types';
import { pathOf, isWorkspaceThumbnail } from '@/lib/artifact-path';
import { isGeneratedGuidePath } from './agents-md';
import {
  isEmbeddedApp,
  isLocalCreationTool,
  isMoqira,
  nativeAppType,
  samplerType,
} from './embedded-app';
import { manifestFor } from './crux-tools/registry';
import { parseManifest, publicOutputPath, type ToolPublication } from './crux-tools/manifest';

export interface PublicationFile {
  file: Artifact;
  path: string;
}
export type PublicationPlan =
  | {
      kind: 'static';
      files: PublicationFile[];
      declaration: Extract<ToolPublication, { type: 'static' }>;
    }
  | { kind: 'files' | 'tool-package'; files: PublicationFile[] }
  | { kind: 'build' }
  | { kind: 'garden-package' }
  | { kind: 'unavailable'; explanation: string };

/** Internal work never forms a visitor edition or its change indicator. */
export function isInternalArtifactPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    isWorkspaceThumbnail(p) ||
    p === '.keep' ||
    p.endsWith('/.keep') ||
    isGeneratedGuidePath(path) ||
    p.startsWith('cruxspace-assets/') ||
    (p.startsWith('exports/') && p.endsWith('.asset.json'))
  );
}
export function publishableArtifacts(artifacts: Artifact[]): Artifact[] {
  return artifacts.filter(
    (file) => file.type === 'artifact' && !isInternalArtifactPath(pathOf(file)),
  );
}

function staticFiles(
  declaration: Extract<ToolPublication, { type: 'static' }>,
  artifacts: Artifact[],
): PublicationFile[] {
  const files: PublicationFile[] = [];
  const paths = new Set<string>();
  const eligible = publishableArtifacts(artifacts);
  const add = (file: Artifact, path: string) => {
    if (!publicOutputPath(pathOf(file)) || !publicOutputPath(path))
      throw new Error(`The public edition contains a private or invalid path: ${pathOf(file)}.`);
    if (paths.has(path)) throw new Error(`The public edition has more than one file at ${path}.`);
    paths.add(path);
    files.push({ file, path });
  };
  for (const file of eligible)
    if (pathOf(file).startsWith(declaration.root))
      add(file, pathOf(file).slice(declaration.root.length));
  for (const include of declaration.include ?? []) {
    const directory = include.endsWith('/');
    const matches = eligible.filter((file) =>
      directory ? pathOf(file).startsWith(include) : pathOf(file) === include,
    );
    if (!directory && matches.length === 0)
      throw new Error(`The public edition is missing ${include}.`);
    for (const file of matches) add(file, pathOf(file));
  }
  if (!paths.has('index.html'))
    throw new Error(`The public edition needs ${declaration.root}index.html.`);
  return files;
}

/** One decision for sharing controls, byte collection and publication change detection.
 * Existing trusted exporters remain unchanged; new tools declare bounded static files. */
export function publicationPlan(
  crux: Pick<Crux, 'kind' | 'meta'>,
  artifacts: Artifact[],
  site = artifacts.some((file) => /^astro\.config\.(mjs|js|ts|cjs)$/.test(pathOf(file))),
): PublicationPlan {
  const ordinary = () =>
    publishableArtifacts(artifacts).map((file) => ({
      file,
      path: pathOf(file) || 'file',
    }));
  if (crux.kind === 'tool') return { kind: 'tool-package', files: ordinary() };
  try {
    // A malformed project snapshot is never permission to publish all its files.
    const manifest = crux.meta?.toolManifest
      ? parseManifest(crux.meta.toolManifest)
      : manifestFor(crux);
    if (manifest?.publication?.type === 'garden-package') return { kind: 'garden-package' };
    if (manifest?.publication?.type === 'static')
      return {
        kind: 'static',
        declaration: manifest.publication,
        files: staticFiles(manifest.publication, artifacts),
      };
    if (isLocalCreationTool(crux))
      return {
        kind: 'unavailable',
        explanation:
          'This is a local creation tool. Use and save it in Garden. Website sharing is not available for this Crux yet.',
      };
    if (
      site ||
      isMoqira(crux) ||
      crux.kind === 'notes' ||
      ['formjs', 'maps'].includes(nativeAppType(crux) ?? '')
    )
      return { kind: 'build' };
    if (
      isEmbeddedApp(crux) &&
      !['p5', 'glsl', 'abc', 'jscad', 'timeline', 'underrun'].includes(nativeAppType(crux) ?? '') &&
      samplerType(crux) !== 'excalidraw'
    )
      return {
        kind: 'unavailable',
        explanation:
          'This tool has not declared a supported public edition. Its author can add a static publication directory and explicitly included files to crux-tool.json. You can still export the complete Crux.',
      };
    return { kind: 'files', files: ordinary() };
  } catch (error) {
    return {
      kind: 'unavailable',
      explanation:
        error instanceof Error ? error.message : 'The public edition declaration is invalid.',
    };
  }
}
