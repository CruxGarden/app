/**
 * Site cruxes (ADR 0005) — renderer side.
 *
 * A Site Crux has a build step: sources live in history, `pnpm install` +
 * the project's dev server power the workshop, and publish ships the built
 * dist/ output. Everything here is desktop-only and no-ops on web.
 */

import type { Artifact } from '@/api/types';
import { Capability, can } from '@/lib/platform';
import { folderForCrux } from './project-folder';
import { guessMimeType } from './sqlite/helpers';

interface ToolchainBridge {
  isInstalled(folder: string): Promise<boolean>;
  hasPackageJson(folder: string): Promise<boolean>;
  install(folder: string): Promise<{ code: number; log: string }>;
  build(folder: string): Promise<{ code: number; log: string; distFiles: string[] }>;
  scaffold(folder: string, args: string[]): Promise<{ code: number; log: string }>;
  onOutput(cb: (data: { folder: string; line: string }) => void): () => void;
}

interface DevServerBridge {
  start(folder: string): Promise<string>;
  stop(folder: string): Promise<void>;
  status(folder: string): Promise<{ status: string; url: string | null }>;
  log(folder: string): Promise<string>;
  onStatus(cb: (data: { folder: string; status: string; url: string | null }) => void): () => void;
}

interface ProjectReadBridge {
  readFile(folder: string, relPath: string): Promise<Uint8Array>;
}

function bridges(): {
  toolchain: ToolchainBridge;
  devserver: DevServerBridge;
  project: ProjectReadBridge;
} | null {
  if (!can(Capability.Build)) return null;
  const api = (window as unknown as {
    electronAPI: {
      toolchain: ToolchainBridge;
      devserver: DevServerBridge;
      project: ProjectReadBridge;
    };
  }).electronAPI;
  return { toolchain: api.toolchain, devserver: api.devserver, project: api.project };
}

/** A crux whose files include an Astro config is a Site Crux. */
export function isSiteCrux(artifacts: Artifact[]): boolean {
  return artifacts.some((a) => {
    const p = (a.meta?.path as string | undefined) || a.filename || '';
    return /^astro\.config\.(mjs|js|ts|cjs)$/.test(p);
  });
}

export class SiteBuildError extends Error {
  constructor(message: string, readonly log: string) {
    super(message);
    this.name = 'SiteBuildError';
  }
}

/**
 * Run a template's scaffold script (e.g. `pnpm dlx create-astro …`) in the
 * crux's Project Folder. Files it writes reach the store via ingestion.
 */
export async function runScaffold(cruxId: string, pnpmArgs: string[]): Promise<void> {
  const api = bridges();
  if (!api) return;
  const folder = await folderForCrux(cruxId);
  if (!folder) return;
  const result = await api.toolchain.scaffold(folder, pnpmArgs);
  if (result.code !== 0) {
    throw new SiteBuildError('Template scaffold failed', result.log);
  }
}

/** Ensure node_modules exists (runs `pnpm install` on first use). */
export async function ensureInstalled(cruxId: string): Promise<void> {
  const api = bridges();
  if (!api) return;
  const folder = await folderForCrux(cruxId);
  if (!folder) return;
  if (!(await api.toolchain.hasPackageJson(folder))) return;
  if (await api.toolchain.isInstalled(folder)) return;

  const result = await api.toolchain.install(folder);
  if (result.code !== 0) {
    throw new SiteBuildError('Dependency install failed', result.log);
  }
}

/** Start (or reuse) the site's dev server. Resolves with its URL when ready. */
export async function startDevServer(cruxId: string): Promise<string | null> {
  const api = bridges();
  if (!api) return null;
  const folder = await folderForCrux(cruxId);
  if (!folder) return null;
  await ensureInstalled(cruxId);
  return api.devserver.start(folder);
}

export async function stopDevServer(cruxId: string): Promise<void> {
  const api = bridges();
  if (!api) return;
  const folder = await folderForCrux(cruxId);
  if (folder) await api.devserver.stop(folder);
}

/**
 * Build the site and return its dist/ output as publishable files
 * (ADR 0005: publish ships the build output, never the sources).
 */
export async function buildForPublish(
  cruxId: string,
  onProgress?: (message: string) => void,
): Promise<Array<{ blob: Blob; path: string; type: string; kind: string; mimeType: string }>> {
  const api = bridges();
  if (!api) throw new SiteBuildError('Building requires the desktop app', '');
  const folder = await folderForCrux(cruxId);
  if (!folder) throw new SiteBuildError('This crux has no project folder', '');

  onProgress?.('Installing dependencies…');
  await ensureInstalled(cruxId);

  onProgress?.('Building site…');
  const result = await api.toolchain.build(folder);
  if (result.code !== 0) {
    throw new SiteBuildError('Build failed — nothing was published', result.log);
  }
  if (result.distFiles.length === 0) {
    throw new SiteBuildError('Build produced no output in dist/', result.log);
  }

  onProgress?.(`Collecting ${result.distFiles.length} built files…`);
  const files: Array<{ blob: Blob; path: string; type: string; kind: string; mimeType: string }> =
    [];
  for (const relPath of result.distFiles) {
    const bytes = await api.project.readFile(folder, relPath);
    const publishPath = relPath.replace(/^dist\//, '');
    const mimeType = guessMimeType(publishPath);
    files.push({
      blob: new Blob([bytes as BlobPart], { type: mimeType }),
      path: publishPath,
      // The API's artifacts table requires these (NOT NULL)
      type: 'artifact',
      kind: 'file',
      mimeType,
    });
  }
  return files;
}
