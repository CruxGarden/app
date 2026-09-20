import { useEffect, useState } from 'react';
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting } from '@/services/settings';
import { getServices } from '@/services';
import { toolManifest } from './registry';

/**
 * Crux Tools installed into this garden (CRUX-TOOLS-DISTRIBUTION-PLAN §3,
 * ADR 0050). A tool that is not in the build is installed by cloning its
 * published Template Crux — from Explore (any garden's, crux.garden's or one
 * on this machine) or from a `.crux` file — into a Crux of `kind: 'tool'`
 * that stays out of the garden's list. Creating from the tool then clones
 * that Crux's Artifacts by fingerprint: no download, no second copy of the
 * blobs. This registry maps tool id → that Template Crux.
 */
export interface InstalledTool {
  /** The tool's manifest id (`meta.template`). */
  id: string;
  /** The Template Crux in this garden, `kind: 'tool'`. */
  cruxId: string;
  /** Where it came from, when it was fetched from a published Crux. */
  publishedCruxId?: string;
  author?: string;
  slug?: string;
  installedAt: string;
}

export const INSTALLED_TOOLS_CHANGED = 'crux-tools:installed-changed';

export function installedTools(): Record<string, InstalledTool> {
  const raw = getSetting(SettingsKey.InstalledTools);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, InstalledTool>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function installedTool(id: string): InstalledTool | null {
  return installedTools()[id] ?? null;
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INSTALLED_TOOLS_CHANGED));
}

export function recordInstalledTool(tool: InstalledTool): void {
  setSetting(SettingsKey.InstalledTools, JSON.stringify({ ...installedTools(), [tool.id]: tool }));
  announce();
}

export function forgetInstalledTool(id: string): void {
  const rest = { ...installedTools() };
  delete rest[id];
  setSetting(SettingsKey.InstalledTools, JSON.stringify(rest));
  announce();
}

/** The installed set, live — the picker re-renders as a tool arrives. */
export function useInstalledTools(): Record<string, InstalledTool> {
  const [tools, setTools] = useState(installedTools);
  useEffect(() => {
    const update = () => setTools(installedTools());
    window.addEventListener(INSTALLED_TOOLS_CHANGED, update);
    return () => window.removeEventListener(INSTALLED_TOOLS_CHANGED, update);
  }, []);
  return tools;
}

/** A published Crux as Explore lists it — enough to fetch its files. */
export interface PublishedToolCrux {
  id: string;
  slug: string;
  title?: string;
  description?: string | null;
  author_username: string;
  meta?: Record<string, unknown> | null;
}

export interface InstallToolDeps {
  apiArtifacts: (
    username: string,
    slug: string,
  ) => Promise<
    {
      id: string;
      meta?: { path?: string } | null;
      filename?: string;
      mimeType: string;
      encoding: string;
      size: number;
    }[]
  >;
  apiDownload: (username: string, slug: string, artifactId: string) => Promise<Blob>;
  putBlob: (bytes: Uint8Array | Blob) => Promise<string>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Install a tool from its published Template Crux: every Artifact is
 * downloaded once into the Blob Store, a `kind: 'tool'` Crux is made to hold
 * them, and the tool is recorded as installed. Installing again replaces the
 * record (the old Template Crux is left for the garden's trash rules).
 */
export async function installToolFromPublished(
  crux: PublishedToolCrux,
  deps: InstallToolDeps,
): Promise<InstalledTool> {
  const id = typeof crux.meta?.template === 'string' ? crux.meta.template : null;
  const manifest = id ? toolManifest(id) : null;
  if (!id || !manifest) throw new Error('This Crux is not a Crux Tool this app knows.');
  const arts = await deps.apiArtifacts(crux.author_username, crux.slug);
  if (!arts.length) throw new Error('The published tool has no files.');
  const services = getServices();
  const holder = await services.crux.create({
    title: manifest.name,
    kind: 'tool',
    meta: {
      template: id,
      settings: { entryFile: manifest.entryFile },
      toolInfo: { ...manifest.toolInfo },
      installedFrom: { cruxId: crux.id, author: crux.author_username, slug: crux.slug },
    },
  });
  const registrations = [];
  let done = 0;
  for (const a of arts) {
    const path = a.meta?.path || a.filename;
    if (!path) continue;
    const blob = await deps.apiDownload(crux.author_username, crux.slug, a.id);
    const fingerprint = await deps.putBlob(blob);
    registrations.push({
      resourceId: holder.id,
      path,
      fingerprint,
      size: blob.size,
      mimeType: a.mimeType || blob.type || 'application/octet-stream',
      encoding: a.encoding || 'binary',
      meta: { path },
    });
    deps.onProgress?.(++done, arts.length);
  }
  await services.artifact.registerMany(registrations);
  const tool: InstalledTool = {
    id,
    cruxId: holder.id,
    publishedCruxId: crux.id,
    author: crux.author_username,
    slug: crux.slug,
    installedAt: new Date().toISOString(),
  };
  recordInstalledTool(tool);
  return tool;
}

/**
 * Install a tool from a Crux already in this garden — a `.crux` package just
 * imported. The Crux becomes the tool's Template Crux (`kind: 'tool'`, out of
 * the garden's list) and the tool is recorded.
 */
export async function installToolFromCrux(cruxId: string): Promise<InstalledTool | null> {
  const services = getServices();
  const crux = await services.crux.findById(cruxId);
  const id = typeof crux?.meta?.template === 'string' ? crux.meta.template : null;
  if (!id || !toolManifest(id)) return null;
  await services.crux.update(cruxId, { kind: 'tool' });
  const tool: InstalledTool = { id, cruxId, installedAt: new Date().toISOString() };
  recordInstalledTool(tool);
  return tool;
}
