import { useEffect, useState } from 'react';
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting, setSettingDurably } from '@/services/settings';
import { getServices } from '@/services';
import { getSqliteClient } from '../sqlite/client';
import { toolManifest } from './registry';
import { parseManifest, type CruxToolManifest } from './manifest';
import { openToolPackage, packTool, TOOL_PACKAGE_PATH, type ToolPackageReference } from './package';

/**
 * Crux Tools installed into this garden (CRUX-TOOLS-DISTRIBUTION-PLAN §3,
 * ADR 0050). A tool that is not in the build is installed by cloning its
 * published Template Crux — from Explore (any garden's, crux.garden's or one
 * on this machine) or from a `.crux` file — into a Crux of `kind: 'tool'`
 * that stays out of the garden's list. Creating from the tool unpacks its
 * immutable archive into normal project Artifacts without another download.
 * This registry maps tool id → that Template Crux.
 */
export interface InstalledTool {
  /** Local installation identity, scoped to the publication or file fingerprint. */
  id: string;
  /** The Template Crux in this garden, `kind: 'tool'`. */
  cruxId: string;
  /** Where it came from, when it was fetched from a published Crux. */
  publishedCruxId?: string;
  author?: string;
  slug?: string;
  installedAt: string;
  /** Package identity; the local id is scoped to its publication. */
  manifest?: CruxToolManifest;
  fingerprint?: string;
}

/** Publication UUID prevents two creators using the same manifest id from replacing each other. */
export function publishedToolId(cruxId: string): string {
  return `installed-${cruxId}`;
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
  apiDownload: (username: string, slug: string, artifactId: string) => Promise<Blob>;
  putBlob: (bytes: Uint8Array | Blob) => Promise<string>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Install a tool from its published Template Crux: every Artifact is
 * transferred as one archive into the Blob Store; a `kind: 'tool'` Crux holds
 * that one package, and the tool is recorded as installed. Installing again replaces the
 * record (the old Template Crux is left for the garden's trash rules).
 */
export async function installToolFromPublished(
  crux: PublishedToolCrux,
  deps: InstallToolDeps,
): Promise<InstalledTool> {
  const owner = getSqliteClient();
  const id = typeof crux.meta?.template === 'string' ? crux.meta.template : null;
  if (!id) throw new Error('This publication does not declare a tool identity.');
  const reference = crux.meta?.toolPackage as ToolPackageReference | undefined;
  if (
    !reference ||
    reference.version !== 1 ||
    typeof reference.artifactId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(reference.fingerprint)
  )
    throw new Error(
      'This tool needs to be republished as a single package before it can be installed.',
    );
  const previous = installedTool(publishedToolId(crux.id));
  deps.onProgress?.(0, 1);
  const blob = await deps.apiDownload(crux.author_username, crux.slug, reference.artifactId);
  const { manifest } = await openToolPackage(blob, id, reference.fingerprint);
  if (getSqliteClient() !== owner)
    throw new Error('The local connection changed. Retry this installation.');
  if (previous?.fingerprint === reference.fingerprint) return previous;
  const fingerprint = await deps.putBlob(blob);
  const services = getServices();
  const holder = await services.crux.create({
    title: manifest.name,
    kind: 'tool',
    meta: {
      template: id,
      toolManifest: manifest,
      toolPackage: { ...reference, fingerprint },
      toolInfo: { ...manifest.toolInfo },
      installedFrom: { cruxId: crux.id, author: crux.author_username, slug: crux.slug },
    },
  });
  try {
    await services.artifact.registerMany([
      {
        resourceId: holder.id,
        path: TOOL_PACKAGE_PATH,
        fingerprint,
        size: blob.size,
        mimeType: 'application/zip',
        encoding: 'binary',
        meta: { path: TOOL_PACKAGE_PATH },
      },
    ]);
  } catch (error) {
    await services.crux.delete(holder.id);
    throw error;
  }
  deps.onProgress?.(1, 1);
  const tool: InstalledTool = {
    id: publishedToolId(crux.id),
    manifest,
    fingerprint,
    cruxId: holder.id,
    publishedCruxId: crux.id,
    author: crux.author_username,
    slug: crux.slug,
    installedAt: new Date().toISOString(),
  };
  await setSettingDurably(
    SettingsKey.InstalledTools,
    JSON.stringify({ ...installedTools(), [tool.id]: tool }),
  );
  announce();
  return tool;
}

/** Read the immutable installed package locally; old per-file installations remain compatible. */
export async function installedToolPackage(tool: InstalledTool) {
  const service = getServices().artifact;
  const artifacts = await service.findByResource('crux', tool.cruxId);
  const file = artifacts.find((a) => (a.meta?.path || a.filename) === TOOL_PACKAGE_PATH);
  if (!file) return null;
  return openToolPackage(
    await service.downloadBlob(file),
    tool.manifest?.id ?? tool.id,
    file.fingerprint || undefined,
  );
}

/**
 * Install a tool from a Crux already in this garden — a `.crux` package just
 * imported. The Crux becomes the tool's Template Crux (`kind: 'tool'`, out of
 * the garden's list) and the tool is recorded.
 */
export async function installToolFromCrux(cruxId: string): Promise<InstalledTool | null> {
  const services = getServices();
  const crux = await services.crux.findById(cruxId);
  if (crux.kind !== 'tool') return null;
  const artifacts = await services.artifact.findByResource('crux', cruxId);
  const definition = artifacts.find((f) => (f.meta?.path || f.filename) === 'crux-tool.json');
  const declared = definition
    ? parseManifest(JSON.parse(await services.artifact.readContent(definition)))
    : null;
  const id = declared?.id ?? (typeof crux.meta?.template === 'string' ? crux.meta.template : null);
  if (!id) return null;
  const tool: InstalledTool = { id, cruxId, installedAt: new Date().toISOString() };
  const pkg = await installedToolPackage(tool);
  if (!pkg) {
    const manifest = declared ?? toolManifest(id);
    if (!manifest) throw new Error('This tool needs a valid crux-tool.json.');
    const blob = await packTool(
      manifest,
      await Promise.all(
        artifacts.map(async (file) => ({
          path: String(file.meta?.path || file.filename),
          blob: await services.artifact.downloadBlob(file),
          mimeType: file.mimeType || 'application/octet-stream',
        })),
      ),
    );
    const { putBlob } = await import('../blobs');
    const { hashContent } = await import('../sqlite/helpers');
    return installToolFromPublished(
      {
        id: cruxId,
        slug: crux.slug,
        author_username: '',
        meta: {
          template: id,
          toolPackage: {
            version: 1,
            artifactId: 'local-package',
            fingerprint: await hashContent(blob),
          },
        },
      },
      { apiDownload: async () => blob, putBlob },
    );
  }
  tool.manifest = pkg.manifest;
  tool.id = publishedToolId(cruxId);
  await setSettingDurably(
    SettingsKey.InstalledTools,
    JSON.stringify({ ...installedTools(), [tool.id]: tool }),
  );
  announce();
  return tool;
}
