/**
 * Publishing a Mood: the package becomes a crux of kind "mood" in your garden
 * — a real Project Folder holding mood.cruxmood (the package with assets),
 * mood.json (the manifest, for Explore cards), and index.html (a preview
 * page) — and goes through the ordinary publish pipeline. Anyone can find it
 * in Explore and install it from there.
 */
import { GARDEN_DARK } from './garden-dark';
import {
  exportMoodPackage,
  importMoodPackage,
  installMood,
  packageAssets,
  type MoodPackage,
} from './packages';
import type { Crux } from '@/api/types';

/** The few facts an Explore card needs, stored on crux.meta.mood */
export interface MoodSummary {
  section: 'Dark' | 'Light';
  swatch: Record<string, string>;
  mixes: number;
  layers: number;
  layerTypes: string[];
  author?: string;
}

const SWATCH_KEYS = [
  'bg',
  'panel',
  'surface',
  'accent',
  'border',
  'text',
  'paneCollaboration',
  'paneArtifacts',
  'paneWorkshop',
  'paneDetails',
];

export function moodSummary(pkg: MoodPackage): MoodSummary {
  const g = GARDEN_DARK as Record<string, string>;
  const swatch: Record<string, string> = {};
  for (const k of SWATCH_KEYS) swatch[k] = pkg.theme.overrides[k] || g[k] || '#888888';
  const layerTypes = [...new Set(pkg.resonance.mixes.flatMap((m) => m.layers.map((l) => l.type)))];
  return {
    section: pkg.theme.section,
    swatch,
    mixes: pkg.resonance.mixes.length,
    layers: pkg.resonance.mixes.reduce((n, m) => n + m.layers.length, 0),
    layerTypes,
    author: pkg.author,
  };
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** A small static page so the published crux shows something on its own. */
export function moodPreviewHtml(pkg: MoodPackage): string {
  const s = moodSummary(pkg);
  const sw = s.swatch;
  const panes = ['paneCollaboration', 'paneArtifacts', 'paneWorkshop', 'paneDetails']
    .map((k) => `<span style="background:${esc(sw[k]!)}"></span>`)
    .join('');
  const mixes = pkg.resonance.mixes
    .map(
      (m) =>
        `<li><strong>${esc(m.name)}</strong> <span class="muted">${esc(m.root)} ${esc(m.scale)} · ${m.tempo} bpm · ${m.layers
          .map((l) => esc(l.name))
          .join(', ')}</span></li>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pkg.name)} — a Crux Garden Mood</title>
<style>
  :root{--bg:${esc(sw.bg!)};--panel:${esc(sw.panel!)};--surface:${esc(sw.surface!)};--accent:${esc(sw.accent!)};--border:${esc(sw.border!)};--text:${esc(sw.text!)}}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,system-ui,sans-serif}
  main{width:min(560px,92vw);background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:28px;box-shadow:0 30px 80px rgb(0 0 0/.35)}
  h1{margin:0 0 4px;font-size:28px} .muted{opacity:.7;font-size:13px} .panes{display:flex;gap:4px;margin:14px 0} .panes span{width:28px;height:10px;border-radius:3px;display:block}
  ul{padding-left:18px} a.btn{display:inline-block;margin-top:18px;padding:10px 16px;border-radius:999px;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:600}
  .how{margin-top:18px;font-size:13px;opacity:.75}
</style></head><body><main>
<h1>${esc(pkg.name)}</h1>
<div class="muted">A Crux Garden Mood${pkg.author ? ` by ${esc(pkg.author)}` : ''} · ${esc(s.section)} · ${s.mixes} mix${s.mixes === 1 ? '' : 'es'}, ${s.layers} layer${s.layers === 1 ? '' : 's'}</div>
<div class="panes">${panes}</div>
<ul>${mixes || '<li class="muted">No soundscape</li>'}</ul>
<a class="btn" href="mood.cruxmood" download>Download mood.cruxmood</a>
<p class="how">In Crux Garden, open Explore → Moods and press Install, or import the file from the Mood modal.</p>
</main></body></html>`;
}

export interface PublishMoodDeps {
  services: () => Promise<{
    crux: {
      create(input: Record<string, unknown>): Promise<Crux>;
      update(id: string, updates: Record<string, unknown>): Promise<Crux>;
      findById?(id: string): Promise<Crux | null>;
    };
    artifact: {
      findByResource(
        type: string,
        id: string,
      ): Promise<{ id: string; meta?: { path?: string } | null; filename?: string }[]>;
      create(input: Record<string, unknown>): Promise<unknown>;
      upload(input: Record<string, unknown>): Promise<unknown>;
      delete(id: string): Promise<void>;
    };
  }>;
  readBlob: (fp: string) => Promise<Uint8Array>;
  publish: (crux: Crux, artifacts: unknown[]) => Promise<Crux>;
  now?: () => string;
}

/**
 * Create or refresh the Mood's crux, write its three files, publish. Returns
 * the package with publishedCruxId/publishedAt set (and installs that).
 */
export async function publishMood(pkg: MoodPackage, deps: PublishMoodDeps): Promise<MoodPackage> {
  const { crux: cruxService, artifact: artifactService } = await deps.services();
  const summary = moodSummary(pkg);
  const meta = {
    mood: summary,
    tags: [...new Set(['mood', summary.section.toLowerCase(), ...summary.layerTypes])],
  };

  let crux: Crux | null = null;
  if (pkg.publishedCruxId && cruxService.findById) {
    crux = await cruxService.findById(pkg.publishedCruxId).catch(() => null);
  }
  if (crux) {
    crux = await cruxService.update(crux.id, {
      title: pkg.name,
      description: `A Crux Garden Mood: ${summary.section}, ${summary.mixes} mixes.`,
      kind: 'mood',
      discoverable: true,
      meta: { ...(crux.meta as Record<string, unknown>), ...meta },
    });
  } else {
    crux = await cruxService.create({
      title: pkg.name,
      description: `A Crux Garden Mood: ${summary.section}, ${summary.mixes} mixes.`,
      kind: 'mood',
      meta,
    });
    crux = await cruxService.update(crux.id, {
      discoverable: true,
      meta: { ...(crux.meta as Record<string, unknown>), ...meta },
    });
  }

  // Replace the files (a Mood crux holds nothing else)
  const existing = await artifactService.findByResource('crux', crux.id);
  for (const a of existing) await artifactService.delete(a.id);
  const zip = await exportMoodPackage(pkg, deps.readBlob);
  await artifactService.upload({
    resourceId: crux.id,
    resourceType: 'crux',
    blob: zip,
    meta: { path: 'mood.cruxmood' },
  });
  await artifactService.create({
    resourceId: crux.id,
    content: JSON.stringify({ ...pkg, publishedCruxId: crux.id }, null, 2),
    mimeType: 'application/json',
    meta: { path: 'mood.json' },
  });
  await artifactService.create({
    resourceId: crux.id,
    content: moodPreviewHtml(pkg),
    mimeType: 'text/html',
    meta: { path: 'index.html' },
  });
  const artifacts = await artifactService.findByResource('crux', crux.id);

  const published = await deps.publish(crux, artifacts);
  const stamped: MoodPackage = {
    ...pkg,
    publishedCruxId: published.id,
    publishedAt: (deps.now ?? (() => new Date().toISOString()))(),
  };
  installMood(stamped);
  return stamped;
}

/** Fetch a published Mood's package and install it. Tries the published files, then the public API. */
export async function installMoodFromPublished(
  crux: { id: string; slug: string; author_username: string; title?: string },
  deps: {
    publishBaseUrl: (id: string) => string;
    fetchBlob: (url: string) => Promise<Blob | null>;
    apiArtifacts: (
      username: string,
      slug: string,
    ) => Promise<{ id: string; meta?: { path?: string } | null; filename?: string }[]>;
    apiDownload: (username: string, slug: string, artifactId: string) => Promise<Blob>;
    putBlob: (bytes: Uint8Array) => Promise<string>;
  },
): Promise<MoodPackage | null> {
  let blob = await deps
    .fetchBlob(`${deps.publishBaseUrl(crux.id)}/mood.cruxmood`)
    .catch(() => null);
  if (!blob) {
    const arts = await deps.apiArtifacts(crux.author_username, crux.slug);
    const art = arts.find((a) => (a.meta?.path || a.filename) === 'mood.cruxmood');
    if (!art) return null;
    blob = await deps.apiDownload(crux.author_username, crux.slug, art.id);
  }
  const pkg = await importMoodPackage(blob, deps.putBlob);
  if (!pkg) return null;
  const installed: MoodPackage = { ...pkg, publishedCruxId: pkg.publishedCruxId ?? crux.id };
  installMood(installed);
  return installed;
}

export { packageAssets };
