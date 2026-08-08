/**
 * Site cruxes (ADR 0005) — renderer side.
 *
 * A Site Crux has a build step: sources live in history, `pnpm install` +
 * the project's dev server power the workshop, and publish ships the built
 * dist/ output. Everything here is desktop-only and no-ops on web.
 */

import {
  Capability,
  can,
  type ToolchainBridge,
  type DevServerBridge,
  type ProjectBridge,
} from '@/lib/platform';
import { folderForCrux } from './project-folder';
import { guessMimeType } from '@/lib/mime';
import { pathOf, type ArtifactPathSource } from '@/lib/artifact-path';
import { createLeasePool } from '@/lib/lease';
import type { PublishFile } from './publish';

/** What a build hands to the publish pipeline. */
type PublishableFile = PublishFile;

function bridges(): {
  toolchain: ToolchainBridge;
  devserver: DevServerBridge;
  project: ProjectBridge;
} | null {
  if (!can(Capability.Build)) return null;
  const api = window.electronAPI;
  if (!api) return null;
  return { toolchain: api.toolchain, devserver: api.devserver, project: api.project };
}

/** A crux whose files include an Astro config is a Site Crux. */
export function isSiteCrux(artifacts: ArtifactPathSource[]): boolean {
  return artifacts.some((a) => /^astro\.config\.(mjs|js|ts|cjs)$/.test(pathOf(a)));
}

export class SiteBuildError extends Error {
  constructor(
    message: string,
    readonly log: string,
  ) {
    super(message);
    this.name = 'SiteBuildError';
  }
}

/**
 * Resolve the bridges and the crux's Project Folder together — the preamble
 * every operation here needs. Null when building isn't available on this
 * platform or the crux has no folder.
 */
async function siteContext(
  cruxId: string,
): Promise<{ api: NonNullable<ReturnType<typeof bridges>>; folder: string } | null> {
  const api = bridges();
  if (!api) return null;
  const folder = await folderForCrux(cruxId);
  return folder ? { api, folder } : null;
}

/**
 * Run a template's scaffold script (e.g. `pnpm dlx create-astro …`) in the
 * crux's Project Folder. Files it writes reach the store via ingestion.
 */
export async function runScaffold(cruxId: string, pnpmArgs: string[]): Promise<void> {
  const ctx = await siteContext(cruxId);
  if (!ctx) return;
  const { api, folder } = ctx;
  const result = await api.toolchain.scaffold(folder, pnpmArgs);
  if (result.code !== 0) {
    throw new SiteBuildError('Template scaffold failed', result.log);
  }
}

/** Ensure node_modules exists (runs `pnpm install` on first use). */
export async function ensureInstalled(cruxId: string): Promise<void> {
  const ctx = await siteContext(cruxId);
  if (!ctx) return;
  const { api, folder } = ctx;
  if (!(await api.toolchain.hasPackageJson(folder))) return;
  if (await api.toolchain.isInstalled(folder)) return;

  const result = await api.toolchain.install(folder);
  if (result.code !== 0) {
    throw new SiteBuildError('Dependency install failed', result.log);
  }
}

// ── Dev-server leases ───────────────────────────────────────────────────────
// The dev server belongs to the CRUX, not to whichever editor tab happens to
// be mounted (ADR 0005: "the server lives as long as the crux is open").
// Every start takes a lease; the server stops only when the last lease is
// released and the grace period passes — so switching tabs (unmount then
// remount) reuses the running server instead of restarting `astro dev`.

export const devServerLeases = createLeasePool({
  graceMs: 3000,
  stop: async (cruxId) => {
    const ctx = await siteContext(cruxId);
    if (ctx) await ctx.api.devserver.stop(ctx.folder);
  },
  onStopError: (cruxId, err) => console.error(`[site] dev server stop failed (${cruxId}):`, err),
});

/**
 * Start (or reuse) the site's dev server and take a lease on it.
 * Resolves with its URL when ready. Pair every call with `stopDevServer`.
 */
export async function startDevServer(cruxId: string): Promise<string | null> {
  const ctx = await siteContext(cruxId);
  if (!ctx) return null;
  const { api, folder } = ctx;

  devServerLeases.acquire(cruxId);
  try {
    await ensureInstalled(cruxId);
    return await api.devserver.start(folder);
  } catch (err) {
    devServerLeases.release(cruxId);
    throw err;
  }
}

/** Release a lease. The server stops once no leases remain (after a grace period). */
export async function stopDevServer(cruxId: string): Promise<void> {
  devServerLeases.release(cruxId);
}

/**
 * Run the production build and report the outcome without collecting output —
 * the AI's check_site tool. Returns null when building isn't available here
 * (web, or no Project Folder). Throws SiteBuildError if the install fails.
 */
export async function checkSiteBuild(cruxId: string): Promise<{ ok: boolean; log: string } | null> {
  const ctx = await siteContext(cruxId);
  if (!ctx) return null;
  const { api, folder } = ctx;
  if (!(await api.toolchain.hasPackageJson(folder))) {
    return {
      ok: false,
      log: 'No package.json found — this crux has no build step (not a Site Crux).',
    };
  }
  await ensureInstalled(cruxId);
  const result = await api.toolchain.build(folder);
  return { ok: result.code === 0, log: result.log };
}

/**
 * Build the site and return its dist/ output as publishable files
 * (ADR 0005: publish ships the build output, never the sources).
 */
export async function buildForPublish(
  cruxId: string,
  onProgress?: (message: string) => void,
): Promise<PublishableFile[]> {
  const ctx = await siteContext(cruxId);
  if (!ctx) {
    throw new SiteBuildError(
      bridges() ? 'This crux has no project folder' : 'Building requires the desktop app',
      '',
    );
  }
  const { api, folder } = ctx;

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
  const files: PublishableFile[] = [];
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
