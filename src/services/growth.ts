/**
 * Growth module — the snapshot lifecycle behind one interface.
 *
 * Owns: snapshot creation (fingerprint, artifact cloning, preview detection,
 * growth dimension), the parent-chain walk (previously implemented three
 * times), conversation reconstruction, the AI summary, and the auto-snapshot
 * policy. This module never imports the workspace store — callers hand in
 * state and apply the returned results (the store's createSnapshot action is
 * the one place that wiring lives).
 *
 * Deps are injectable for tests; production callers use `defaultGrowthDeps()`.
 */

import type { Artifact, ChatMessage, Crux, Dimension } from '@/api/types';
import { pathOf, isWorkspaceThumbnail } from '@/lib/artifact-path';
import { isGeneratedGuidePath } from './agents-md';

// ── Deps ────────────────────────────────────────────────────────────────────

export interface GrowthDeps {
  crux: {
    create(input: Record<string, unknown>): Promise<Crux>;
    findById(id: string): Promise<Crux>;
    update(id: string, input: Record<string, unknown>): Promise<unknown>;
  };
  artifact: {
    computeSnapshotFingerprint(cruxId: string): Promise<string>;
    cloneArtifactsToSnapshot(fromId: string, toId: string): Promise<unknown>;
    findByResource(type: string, id: string): Promise<Artifact[]>;
  };
  dimension: {
    create(input: Record<string, unknown>): Promise<Dimension>;
    update(id: string, input: Record<string, unknown>): Promise<unknown>;
  };
}

export async function defaultGrowthDeps(): Promise<GrowthDeps> {
  const { getServices } = await import('./index');
  const { crux, artifact, dimension } = getServices();
  return {
    crux: {
      create: (input) => crux.create(input as unknown as Parameters<typeof crux.create>[0]),
      findById: (id) => crux.findById(id),
      update: (id, input) => crux.update(id, input as Parameters<typeof crux.update>[1]),
    },
    artifact,
    dimension: {
      create: (input) =>
        dimension.create(input as unknown as Parameters<typeof dimension.create>[0]),
      update: (id, input) => dimension.update(id, input as Parameters<typeof dimension.update>[1]),
    },
  };
}

// ── The chain walk (single implementation) ──────────────────────────────────

export interface SnapshotChainNode {
  id: string;
  messages: ChatMessage[];
  parentCruxId: string | null;
}

/**
 * Walk parentCruxId links backwards from `tipId`, returning the chain in
 * chronological order (root first). Cycle-safe; a missing node ends the walk.
 */
export async function walkSnapshotChain(
  tipId: string,
  lookup: (id: string) => Promise<SnapshotChainNode | null>,
): Promise<SnapshotChainNode[]> {
  const chain: SnapshotChainNode[] = [];
  const visited = new Set<string>();
  let current: string | null = tipId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = await lookup(current);
    if (!node) break;
    chain.push(node);
    current = node.parentCruxId;
  }
  return chain.reverse();
}

/** Chain-node lookup over the crux service (deleted snapshots end the walk). */
export function chainLookupFromService(deps: {
  findById(id: string): Promise<Crux>;
}): (id: string) => Promise<SnapshotChainNode | null> {
  return async (id) => {
    try {
      const snapshot = await deps.findById(id);
      return {
        id,
        messages: (snapshot.meta?.messages as ChatMessage[]) || [],
        parentCruxId: (snapshot.meta?.parentCruxId as string) || null,
      };
    } catch {
      return null;
    }
  };
}

/** All conversation segments up to and including `tipId`, concatenated chronologically. */
export async function collectChainMessages(
  tipId: string,
  lookup: (id: string) => Promise<SnapshotChainNode | null>,
): Promise<ChatMessage[]> {
  const chain = await walkSnapshotChain(tipId, lookup);
  return chain.flatMap((n) => n.messages);
}

// ── Preview detection ───────────────────────────────────────────────────────

export interface PreviewArtifactInfo {
  type: 'html' | 'image' | 'markdown' | 'code' | 'text';
  path: string;
  artifactId: string;
  mimeType: string;
}

/** App-managed files that are never "the work": the generated agent guide and empty-dir markers. */
function isHousekeepingPath(path: string): boolean {
  return isGeneratedGuidePath(path) || path === '.keep' || path.endsWith('/.keep');
}

/** Detect the "primary" artifact for preview/thumbnail purposes */
export function detectPreviewArtifact(allArtifacts: Artifact[]): PreviewArtifactInfo | null {
  // AGENTS.md / CLAUDE.md / .keep must never become a snapshot's face
  const artifacts = allArtifacts.filter((a) => !isHousekeepingPath(pathOf(a)));
  if (artifacts.length === 0) return null;

  const info = (a: Artifact, type: PreviewArtifactInfo['type']): PreviewArtifactInfo => ({
    type,
    path: pathOf(a),
    artifactId: a.id,
    mimeType: a.mimeType,
  });

  const indexHtml = artifacts.find((a) => {
    const p = pathOf(a).toLowerCase();
    return p === 'index.html' || p.endsWith('/index.html');
  });
  if (indexHtml) return info(indexHtml, 'html');

  const firstImage = artifacts.find((a) => a.mimeType?.startsWith('image/'));
  if (firstImage) return info(firstImage, 'image');

  const readme = artifacts.find((a) => {
    const p = pathOf(a).toLowerCase();
    return p === 'readme.md' || p.endsWith('/readme.md');
  });
  if (readme) return info(readme, 'markdown');

  const firstText = artifacts.find((a) => a.encoding === 'utf-8');
  if (firstText) {
    const mime = firstText.mimeType || '';
    const isCode =
      mime.includes('javascript') ||
      mime.includes('python') ||
      mime.includes('css') ||
      mime.includes('json') ||
      mime.includes('xml');
    return info(firstText, isCode ? 'code' : 'text');
  }

  return null;
}

// ── Snapshot creation ───────────────────────────────────────────────────────

export interface SnapshotWorkspaceState {
  crux: Crux;
  messages: ChatMessage[];
  messageSegmentStart: number;
  growths: Dimension[];
  growthCount: number;
  artifactCount: number;
}

export interface CreateSnapshotOptions {
  label?: string;
  silent?: boolean; // skip AI summary generation
  /**
   * Who asked for this snapshot (ADR 0013 attribution): 'collaborator' for
   * the built-in AI, 'agent:<name>' for an external agent over MCP. Omitted
   * for snapshots the person takes in the UI and for auto-snapshots.
   */
  requestedBy?: string;
}

export interface SnapshotResult {
  growth: Dimension;
  /** The snapshot crux just created — the new tip of the active branch. */
  snapshotCruxId: string;
  /** New messageSegmentStart for the workspace (== messages.length at capture). */
  newSegmentStart: number;
  /** Inputs for the (optional) AI summary. */
  artifactNames: string[];
  previousSummary?: string;
}

/**
 * Create a snapshot: snapshot crux with this segment's messages, cloned
 * artifacts, preview detection, growth dimension. Pure with respect to app
 * state — the caller applies the result.
 */
export async function createSnapshotCore(
  state: SnapshotWorkspaceState,
  options: CreateSnapshotOptions,
  deps: GrowthDeps,
): Promise<SnapshotResult> {
  const { crux, messages, messageSegmentStart, growths, growthCount, artifactCount } = state;
  const { label, requestedBy } = options;

  // Parent: activeBranch if set (after branching), otherwise the latest snapshot
  const activeBranch = crux.meta?.settings?.activeBranch as string | undefined;
  const parentCruxId =
    activeBranch || (growths.length > 0 ? growths[growths.length - 1]!.targetId : null);

  // Snapshot crux holds only this segment's messages plus the cumulative
  // count so snapshot viewing can truncate correctly.
  const segmentMessages = messages.slice(messageSegmentStart);
  const snapshotSlug = `snapshot-${growthCount + 1}-${Date.now().toString(36)}`;
  const snapshotCrux = await deps.crux.create({
    slug: snapshotSlug,
    title: label || crux.title || 'Snapshot',
    type: 'crux',
    kind: 'snapshot',
    meta: {
      messages: segmentMessages,
      cumulativeMessageCount: messages.length,
      parentCruxId,
    },
  });

  await deps.artifact.cloneArtifactsToSnapshot(crux.id, snapshotCrux.id);

  // Fingerprint the CLONE, not the live workspace. Computing it before the
  // clone let an ingestion batch landing in between produce a snapshot whose
  // recorded fingerprint disagreed with its own artifacts — and the .crux
  // export derives its manifest fingerprint from this value.
  const fingerprint = await deps.artifact.computeSnapshotFingerprint(snapshotCrux.id);
  await deps.crux.update(snapshotCrux.id, {
    meta: { ...(snapshotCrux.meta as Record<string, unknown>), fingerprint },
  });

  const snapshotArtifacts = await deps.artifact.findByResource('crux', snapshotCrux.id);
  const preview = detectPreviewArtifact(snapshotArtifacts);
  const artifactNames = snapshotArtifacts
    .map((a) => pathOf(a))
    .filter((p) => !isHousekeepingPath(p));
  const thumbArtifact = snapshotArtifacts.find((a) => pathOf(a).toLowerCase() === 'preview.jpg');

  const growth = await deps.dimension.create({
    sourceId: crux.id,
    targetId: snapshotCrux.id,
    type: 'growth',
    weight: growthCount + 1,
    meta: {
      artifactCount,
      ...(label ? { label } : {}),
      ...(requestedBy ? { requestedBy } : {}),
      ...(preview ? { preview } : {}),
      ...(thumbArtifact ? { thumbnailId: thumbArtifact.id } : {}),
    },
  });

  const previousSummary =
    growths.length > 0
      ? (growths[growths.length - 1]!.meta?.summary as string | undefined)
      : undefined;

  return {
    growth,
    snapshotCruxId: snapshotCrux.id,
    newSegmentStart: messages.length,
    artifactNames,
    previousSummary,
  };
}

// ── AI summary ──────────────────────────────────────────────────────────────

/** Build a short summary prompt for the AI */
function buildSummaryPrompt(
  messages: ChatMessage[],
  artifactNames: string[],
  previousSummary?: string,
): string {
  const recent = messages.slice(-20);
  const convo = recent
    .map(
      (m) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 300) : '[tool use]'}`,
    )
    .join('\n');

  const artifacts = artifactNames.length > 0 ? `\nArtifacts: ${artifactNames.join(', ')}` : '';

  const previousContext = previousSummary
    ? `\nPrevious snapshot summary: "${previousSummary}"\nDescribe only what CHANGED or was ADDED since then — do not repeat what was already done.`
    : '';

  return `Summarize what was accomplished in this conversation segment in 1-2 short sentences. Focus on what changed, not what already existed. Be specific about the nature of the change (e.g. "changed X to Y", "added Z", "restyled the header").${artifacts}${previousContext}\n\nConversation:\n${convo}`;
}

/**
 * Fire-and-forget AI summary for a snapshot. On success the summary is
 * persisted to the dimension and reported through `onApplied` — the caller
 * decides how to reflect it in UI state.
 */
export async function generateSnapshotSummary(opts: {
  dimensionId: string;
  messages: ChatMessage[];
  artifactNames: string[];
  model: string;
  previousSummary?: string;
  deps: Pick<GrowthDeps, 'dimension'>;
  onApplied?: (dimensionId: string, summary: string) => void;
}): Promise<void> {
  try {
    const { getApiKey } = await import('@/ai/keys');
    const { getProviderForModel } = await import('@/ai/providers');
    const { languageModelFor } = await import('@/ai/engine');
    const { generateText } = await import('ai');

    const providerId = getProviderForModel(opts.model);
    const apiKey = await getApiKey(providerId);
    if (!apiKey) return;

    const response = await generateText({
      model: languageModelFor(opts.model, apiKey),
      system: 'You are a concise technical summarizer. Respond with only the summary, no preamble.',
      prompt: buildSummaryPrompt(opts.messages, opts.artifactNames, opts.previousSummary),
      maxOutputTokens: 150,
    });

    const summary = response.text.trim();
    if (!summary) return;

    await opts.deps.dimension.update(opts.dimensionId, { meta: { summary } });
    opts.onApplied?.(opts.dimensionId, summary);
  } catch (err) {
    console.warn('Failed to generate snapshot summary:', err);
  }
}

// ── Auto-snapshot policy ────────────────────────────────────────────────────

export type SnapshotFrequency = 'ai-turn' | '2m' | '5m' | '10m' | 'manual';

const FREQUENCY_DELAYS: Record<string, number> = {
  '2m': 2 * 60_000,
  '5m': 5 * 60_000,
  '10m': 10 * 60_000,
};

/**
 * When to auto-snapshot after mutating AI turns. 'ai-turn' fires immediately;
 * timed frequencies debounce (each mutation resets the timer) and re-check
 * the frequency at fire time; 'manual' never fires.
 */
export class SnapshotPolicy {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getFrequency: () => SnapshotFrequency,
    private readonly snapshot: () => void | Promise<void>,
  ) {}

  /** Call after an AI turn that mutated files. */
  notifyMutation(): void {
    const freq = this.getFrequency();
    if (freq === 'manual') return;
    if (freq === 'ai-turn') {
      void this.snapshot();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    const delay = FREQUENCY_DELAYS[freq] ?? 5 * 60_000;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.getFrequency() === 'manual') return; // user changed it meanwhile
      void this.snapshot();
    }, delay);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

// ── Growth as an API (AI-COLLABORATION-V3 B0, ADR 0013) ─────────────────────
//
// Everything below is what the `snapshot` / `list_snapshots` / `restore` /
// `branch` / `diff` tools (and, later, the MCP server) run over. Two callers,
// one implementation:
//
// - When the crux is OPEN in the app, the workspace store is the authority on
//   the live conversation, segment start and growth list, so it registers a
//   `GrowthHost` (see `workspaceGrowthHost`) and the tools route through its
//   own createSnapshot / revertToSnapshot / branchFromSnapshot actions.
// - When it is not (an external agent working on a folder while the app shows
//   the garden), `headlessGrowthHost` runs the same cores over persisted state.
//
// Restore and branch take the same safety snapshot the UI takes first.

/** Extra service surface the headless host needs beyond `GrowthDeps`. */
export interface GrowthHostDeps extends GrowthDeps {
  dimension: GrowthDeps['dimension'] & {
    findBySourceAndType(sourceId: string, type: string): Promise<Dimension[]>;
  };
  artifact: GrowthDeps['artifact'] & {
    delete(id: string): Promise<void>;
  };
  /** Store → disk projection after a restore (no-op on web). */
  projectAll(cruxId: string): Promise<unknown>;
  /** Wait for in-flight external edits before capturing (no-op on web). */
  flush(): Promise<void>;
}

export async function defaultGrowthHostDeps(): Promise<GrowthHostDeps> {
  const base = await defaultGrowthDeps();
  const { getServices } = await import('./index');
  const { dimension, artifact } = getServices();
  const { projectAllArtifacts } = await import('./project-folder');
  const { flushIngestion } = await import('./ingestion');
  return {
    ...base,
    dimension: {
      ...base.dimension,
      findBySourceAndType: (sourceId, type) =>
        dimension.findBySourceAndType(sourceId, type as Dimension['type']),
    },
    // Explicit bindings — the service is a class instance, so a spread would
    // drop its prototype methods.
    artifact: {
      computeSnapshotFingerprint: (id) => artifact.computeSnapshotFingerprint(id),
      cloneArtifactsToSnapshot: (from, to) => artifact.cloneArtifactsToSnapshot(from, to),
      findByResource: (type, id) => artifact.findByResource(type, id),
      delete: (id) => artifact.delete(id),
    },
    projectAll: projectAllArtifacts,
    flush: flushIngestion,
  };
}

/** What a tool (or an agent) sees of one snapshot. */
export interface SnapshotInfo {
  /** The snapshot crux id — what restore/branch/diff take. */
  id: string;
  /** The growth dimension id (timeline entry). */
  growthId: string;
  /** Position in the timeline (1-based, the UI's "#N"). */
  number: number;
  label: string | null;
  summary: string | null;
  /** ISO timestamp of capture. */
  when: string;
  parentId: string | null;
  /** Manifest fingerprint of the captured files (null for legacy snapshots). */
  fingerprint: string | null;
  requestedBy: string | null;
}

export const sortGrowths = (growths: Dimension[]): Dimension[] =>
  [...growths].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));

/**
 * Resolve how a model refers to a snapshot: the snapshot crux id, the growth
 * dimension id, "#N" (timeline position, 1-based), or "latest".
 */
export function resolveSnapshotRef(growths: Dimension[], ref: string): Dimension | null {
  const sorted = sortGrowths(growths);
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'latest') return sorted[sorted.length - 1] ?? null;
  const hash = /^#?(\d+)$/.exec(trimmed);
  if (hash) return sorted[Number(hash[1]) - 1] ?? null;
  return sorted.find((g) => g.targetId === trimmed || g.id === trimmed) ?? null;
}

/** The read-only slice of the deps the listing/diff helpers need. */
export interface GrowthReadDeps {
  crux: Pick<GrowthDeps['crux'], 'findById'>;
  artifact: Pick<GrowthDeps['artifact'], 'findByResource'>;
}

async function snapshotInfoOf(
  growth: Dimension,
  number: number,
  deps: Pick<GrowthReadDeps, 'crux'>,
): Promise<SnapshotInfo> {
  let parentId: string | null = null;
  let fingerprint: string | null = null;
  try {
    const snapshotCrux = await deps.crux.findById(growth.targetId);
    parentId = (snapshotCrux.meta?.parentCruxId as string | undefined) || null;
    fingerprint = (snapshotCrux.meta?.fingerprint as string | undefined) || null;
  } catch {
    /* snapshot crux deleted — the timeline entry still exists */
  }
  return {
    id: growth.targetId,
    growthId: growth.id,
    number,
    label: (growth.meta?.label as string | undefined) || null,
    summary: (growth.meta?.summary as string | undefined) || null,
    when: growth.created,
    parentId,
    fingerprint,
    requestedBy: (growth.meta?.requestedBy as string | undefined) || null,
  };
}

/** The crux's snapshots, oldest first; `limit` keeps the most recent N. */
export async function listSnapshots(
  cruxId: string,
  deps: Pick<GrowthReadDeps, 'crux'> & Pick<GrowthHostDeps, 'dimension'>,
  limit?: number,
): Promise<SnapshotInfo[]> {
  const sorted = sortGrowths(await deps.dimension.findBySourceAndType(cruxId, 'growth'));
  const start = limit && limit > 0 ? Math.max(0, sorted.length - limit) : 0;
  const infos: SnapshotInfo[] = [];
  for (let i = start; i < sorted.length; i++) {
    infos.push(await snapshotInfoOf(sorted[i]!, i + 1, deps));
  }
  return infos;
}

// ── Diff (by fingerprint — paths and sizes, no content) ─────────────────────

export interface FileChange {
  path: string;
  size: number;
  /** Size before the change (modified files only). */
  previousSize?: number;
}

export interface SnapshotDiff {
  added: FileChange[];
  removed: FileChange[];
  modified: FileChange[];
}

/** Files that are app state, not the user's work — never part of a diff. */
function isDiffInternal(path: string): boolean {
  const p = path.toLowerCase();
  return isWorkspaceThumbnail(p) || p === '.keep' || p.endsWith('/.keep');
}

/** Pure: compare two artifact sets by path and fingerprint. */
export function diffArtifactSets(from: Artifact[], to: Artifact[]): SnapshotDiff {
  const index = (list: Artifact[]) => {
    const map = new Map<string, Artifact>();
    for (const a of list) {
      if (a.type !== 'artifact') continue;
      const path = pathOf(a);
      if (!path || isDiffInternal(path)) continue;
      map.set(path, a);
    }
    return map;
  };
  const before = index(from);
  const after = index(to);
  const diff: SnapshotDiff = { added: [], removed: [], modified: [] };
  for (const [path, a] of after) {
    const b = before.get(path);
    if (!b) diff.added.push({ path, size: a.size ?? 0 });
    else if (b.fingerprint !== a.fingerprint)
      diff.modified.push({ path, size: a.size ?? 0, previousSize: b.size ?? 0 });
  }
  for (const [path, b] of before) {
    if (!after.has(path)) diff.removed.push({ path, size: b.size ?? 0 });
  }
  const byPath = (x: FileChange, y: FileChange) => x.path.localeCompare(y.path);
  diff.added.sort(byPath);
  diff.removed.sort(byPath);
  diff.modified.sort(byPath);
  return diff;
}

export const diffIsEmpty = (d: SnapshotDiff): boolean =>
  d.added.length === 0 && d.removed.length === 0 && d.modified.length === 0;

/**
 * Diff two snapshot cruxes — or a snapshot against the working state, by
 * passing the workspace crux id as `toId`.
 */
export async function diffSnapshots(
  fromId: string,
  toId: string,
  deps: Pick<GrowthReadDeps, 'artifact'>,
): Promise<SnapshotDiff> {
  const [from, to] = await Promise.all([
    deps.artifact.findByResource('crux', fromId),
    deps.artifact.findByResource('crux', toId),
  ]);
  return diffArtifactSets(from, to);
}

// ── Auto-snapshot dedupe ────────────────────────────────────────────────────

/**
 * True when the working files are byte-identical (by manifest fingerprint)
 * to the tip snapshot — the active branch if set, else the latest. The
 * auto-snapshot after a turn uses this to avoid a second, identical snapshot
 * when the model already took one (a `snapshot` or `restore` at the end of a
 * turn). Conversation segments are not lost: the next snapshot carries them.
 */
export async function workspaceUnchangedSinceTip(
  crux: Crux,
  growths: Dimension[],
  deps: Pick<GrowthDeps, 'crux' | 'artifact'>,
): Promise<boolean> {
  const tipId =
    (crux.meta?.settings?.activeBranch as string | undefined) ||
    sortGrowths(growths)[growths.length - 1]?.targetId;
  if (!tipId) return false;
  try {
    const tip = await deps.crux.findById(tipId);
    const tipFingerprint = tip.meta?.fingerprint as string | undefined;
    if (!tipFingerprint) return false;
    return (await deps.artifact.computeSnapshotFingerprint(crux.id)) === tipFingerprint;
  } catch {
    return false;
  }
}

/** `createSnapshotCore`, skipped (null) when nothing changed since the tip. */
export async function createSnapshotIfChanged(
  state: SnapshotWorkspaceState,
  options: CreateSnapshotOptions,
  deps: GrowthDeps,
): Promise<SnapshotResult | null> {
  if (await workspaceUnchangedSinceTip(state.crux, state.growths, deps)) return null;
  return createSnapshotCore(state, options, deps);
}

// ── Restore / branch cores (the UI's revert & branch, minus the store) ──────

/**
 * Replace the workspace files with a snapshot's: delete current artifacts,
 * clone the snapshot's rows (metadata-only), then project the store onto the
 * Project Folder — the clone never touches disk, and the deletes did, so
 * without the projection a desktop folder would be left empty. Returns what
 * changed from the caller's point of view (working state → snapshot).
 */
export async function restoreFilesCore(
  cruxId: string,
  snapshotId: string,
  deps: Pick<GrowthHostDeps, 'artifact' | 'projectAll'>,
): Promise<SnapshotDiff> {
  const before = await deps.artifact.findByResource('crux', cruxId);
  await Promise.allSettled(before.map((a) => deps.artifact.delete(a.id)));
  await deps.artifact.cloneArtifactsToSnapshot(snapshotId, cruxId);
  await deps.projectAll(cruxId);
  const after = await deps.artifact.findByResource('crux', cruxId);
  return diffArtifactSets(before, after);
}

// ── Growth host seam ────────────────────────────────────────────────────────

export interface GrowthActor {
  /** 'collaborator' | 'agent:<name>' — recorded on the snapshot. */
  requestedBy: string;
}

export interface RestoreReport {
  /** The safety snapshot taken first (null if it could not be taken). */
  safety: SnapshotInfo | null;
  /** The snapshot the workspace now matches. */
  target: SnapshotInfo;
  changes: SnapshotDiff;
}

export interface GrowthHost {
  snapshot(opts: { label?: string } & GrowthActor): Promise<SnapshotInfo>;
  list(limit?: number): Promise<SnapshotInfo[]>;
  restore(snapshotId: string, actor: GrowthActor): Promise<RestoreReport>;
  branch(snapshotId: string, label: string, actor: GrowthActor): Promise<RestoreReport>;
  diff(fromId: string, toId?: string): Promise<SnapshotDiff>;
}

const hosts = new Map<string, GrowthHost>();

/**
 * The workspace store registers itself here while a crux is open so growth
 * tools mutate the live conversation/timeline instead of persisted copies of
 * them. Returns the unregister function.
 */
export function registerGrowthHost(cruxId: string, host: GrowthHost): () => void {
  hosts.set(cruxId, host);
  return () => {
    if (hosts.get(cruxId) === host) hosts.delete(cruxId);
  };
}

export function registeredGrowthHost(cruxId: string): GrowthHost | null {
  return hosts.get(cruxId) ?? null;
}

/** The host for a crux: the registered one when it is open, else headless. */
export async function growthHostFor(cruxId: string): Promise<GrowthHost> {
  return hosts.get(cruxId) ?? headlessGrowthHost(cruxId, await defaultGrowthHostDeps());
}

/** Fired after a growth tool changed history; carries `{ cruxId, kind }`. */
export const GROWTH_CHANGED_EVENT = 'crux:growth-changed';

function announceGrowthChange(cruxId: string, kind: 'snapshot' | 'restore' | 'branch'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GROWTH_CHANGED_EVENT, { detail: { cruxId, kind } }));
  if (kind !== 'snapshot') {
    // Files changed under the open workspace (if any) — same signal ingestion uses
    window.dispatchEvent(new CustomEvent('crux:external-change', { detail: { cruxId } }));
  }
}

/** The safety snapshot label — the same one the UI's Revert uses. */
export const SAFETY_LABEL_RESTORE = 'Before revert';
export const SAFETY_LABEL_BRANCH = 'Before branch';

/**
 * Growth over persisted state only. The current conversation segment is
 * `crux.meta.messages` (what saveMeta persists), so the segment start is 0.
 */
export function headlessGrowthHost(cruxId: string, deps: GrowthHostDeps): GrowthHost {
  const growthsOf = async () =>
    sortGrowths(await deps.dimension.findBySourceAndType(cruxId, 'growth'));

  async function stateOf(): Promise<SnapshotWorkspaceState> {
    const crux = await deps.crux.findById(cruxId);
    const growths = await growthsOf();
    const artifacts = await deps.artifact.findByResource('crux', cruxId);
    return {
      crux,
      messages: (crux.meta?.messages as ChatMessage[] | undefined) ?? [],
      messageSegmentStart: 0,
      growths,
      growthCount: Math.max((crux.meta?.growthCount as number | undefined) ?? 0, growths.length),
      artifactCount: artifacts.filter((a) => a.type === 'artifact').length,
    };
  }

  async function take(options: CreateSnapshotOptions): Promise<SnapshotInfo> {
    await deps.flush();
    const state = await stateOf();
    const result = await createSnapshotCore(state, options, deps);
    const settings = { ...(state.crux.meta?.settings ?? {}) };
    if (settings.activeBranch) settings.activeBranch = result.snapshotCruxId;
    // The segment is captured: start a fresh one, exactly like the store does.
    await deps.crux.update(cruxId, {
      meta: {
        ...(state.crux.meta ?? {}),
        messages: [],
        growthCount: state.growthCount + 1,
        settings,
      },
    });
    return snapshotInfoOf(result.growth, state.growths.length + 1, deps);
  }

  async function resolve(ref: string): Promise<{ growth: Dimension; number: number }> {
    const growths = await growthsOf();
    const growth = resolveSnapshotRef(growths, ref);
    if (!growth) throw new UnknownSnapshotError(ref);
    return { growth, number: growths.indexOf(growth) + 1 };
  }

  async function safetySnapshot(label: string, actor: GrowthActor): Promise<SnapshotInfo | null> {
    try {
      return await take({ label, silent: true, requestedBy: actor.requestedBy });
    } catch (err) {
      console.warn(`[growth] safety snapshot "${label}" failed:`, err);
      return null;
    }
  }

  return {
    snapshot: async ({ label, requestedBy }) => {
      const info = await take({ label, silent: true, requestedBy });
      announceGrowthChange(cruxId, 'snapshot');
      return info;
    },

    list: (limit) => listSnapshots(cruxId, deps, limit),

    restore: async (snapshotId, actor) => {
      const { growth, number } = await resolve(snapshotId);
      const safety = await safetySnapshot(SAFETY_LABEL_RESTORE, actor);
      const changes = await restoreFilesCore(cruxId, growth.targetId, deps);
      // The restored snapshot is the tip: conversation rebuilt from its chain,
      // empty segment going forward, next snapshot chains from it.
      const crux = await deps.crux.findById(cruxId);
      await deps.crux.update(cruxId, {
        meta: {
          ...(crux.meta ?? {}),
          messages: [],
          settings: { ...(crux.meta?.settings ?? {}), activeBranch: growth.targetId },
        },
      });
      announceGrowthChange(cruxId, 'restore');
      return { safety, target: await snapshotInfoOf(growth, number, deps), changes };
    },

    branch: async (snapshotId, label, actor) => {
      const { growth, number } = await resolve(snapshotId);
      const safety = await safetySnapshot(SAFETY_LABEL_BRANCH, actor);
      const changes = await restoreFilesCore(cruxId, growth.targetId, deps);
      const crux = await deps.crux.findById(cruxId);
      const branchMessage: ChatMessage = {
        role: 'user',
        content: `[System: Branching from snapshot "${label}". The workspace files have been restored to that point. Continue from here on a new branch.]`,
        timestamp: new Date().toISOString(),
      };
      await deps.crux.update(cruxId, {
        meta: {
          ...(crux.meta ?? {}),
          messages: [branchMessage],
          settings: { ...(crux.meta?.settings ?? {}), activeBranch: growth.targetId },
        },
      });
      announceGrowthChange(cruxId, 'branch');
      return { safety, target: await snapshotInfoOf(growth, number, deps), changes };
    },

    diff: async (fromId, toId) => {
      const from = await resolve(fromId);
      const to = toId ? (await resolve(toId)).growth.targetId : cruxId;
      return diffSnapshots(from.growth.targetId, to, deps);
    },
  };
}

export class UnknownSnapshotError extends Error {
  constructor(readonly ref: string) {
    super(
      `Unknown snapshot "${ref}". Call list_snapshots — a snapshot is referred to by its id, "#N" (its position in the timeline), or "latest".`,
    );
    this.name = 'UnknownSnapshotError';
  }
}

/**
 * The store's actions the workspace-bound host wraps — structurally typed so
 * this module never imports the store (the store imports this module).
 */
export interface WorkspaceGrowthActions {
  cruxId: string;
  getCrux(): Crux | null;
  getGrowths(): Dimension[];
  createSnapshot(options: CreateSnapshotOptions): Promise<void>;
  revertToSnapshot(snapshotId: string): Promise<void>;
  branchFromSnapshot(snapshotId: string, label: string): Promise<void>;
}

/**
 * A GrowthHost over the open workspace's store actions: snapshots land in the
 * live timeline, restores rebuild the live conversation, and the store's own
 * safety snapshots ("Before revert" / "Before branch") are the ones taken.
 * Register with `registerGrowthHost(cruxId, workspaceGrowthHost(...))` when a
 * crux is loaded; unregister on reset.
 */
export function workspaceGrowthHost(
  actions: WorkspaceGrowthActions,
  deps: GrowthReadDeps,
): GrowthHost {
  const { cruxId } = actions;

  const newGrowthsSince = (before: Dimension[]): Dimension[] => {
    const seen = new Set(before.map((g) => g.id));
    return sortGrowths(actions.getGrowths().filter((g) => !seen.has(g.id)));
  };
  const infoFor = (growth: Dimension) =>
    snapshotInfoOf(growth, actions.getGrowths().indexOf(growth) + 1, deps);

  function resolve(ref: string): { growth: Dimension; number: number } {
    const growths = sortGrowths(actions.getGrowths());
    const growth = resolveSnapshotRef(growths, ref);
    if (!growth) throw new UnknownSnapshotError(ref);
    return { growth, number: growths.indexOf(growth) + 1 };
  }

  async function restoreLike(
    op: 'restore' | 'branch',
    snapshotId: string,
    run: (target: Dimension) => Promise<void>,
  ): Promise<RestoreReport> {
    const { growth, number } = resolve(snapshotId);
    const growthsBefore = actions.getGrowths();
    const filesBefore = await deps.artifact.findByResource('crux', cruxId);
    await run(growth);
    const filesAfter = await deps.artifact.findByResource('crux', cruxId);
    // The store took its safety snapshot inside the action: it is the one new
    // growth (the restored-to snapshot already existed).
    const added = newGrowthsSince(growthsBefore);
    const safety = added.length > 0 ? await infoFor(added[0]!) : null;
    announceGrowthChange(cruxId, op);
    return {
      safety,
      target: await snapshotInfoOf(growth, number, deps),
      changes: diffArtifactSets(filesBefore, filesAfter),
    };
  }

  return {
    snapshot: async ({ label, requestedBy }) => {
      const before = actions.getGrowths();
      await actions.createSnapshot({ label, requestedBy });
      const added = newGrowthsSince(before);
      if (added.length === 0) throw new Error('The snapshot was not recorded.');
      announceGrowthChange(cruxId, 'snapshot');
      return infoFor(added[added.length - 1]!);
    },
    list: async (limit) => {
      const sorted = sortGrowths(actions.getGrowths());
      const start = limit && limit > 0 ? Math.max(0, sorted.length - limit) : 0;
      const infos: SnapshotInfo[] = [];
      for (let i = start; i < sorted.length; i++)
        infos.push(await snapshotInfoOf(sorted[i]!, i + 1, deps));
      return infos;
    },
    restore: (snapshotId) =>
      restoreLike('restore', snapshotId, (g) => actions.revertToSnapshot(g.targetId)),
    branch: (snapshotId, label) =>
      restoreLike('branch', snapshotId, (g) => actions.branchFromSnapshot(g.targetId, label)),
    diff: async (fromId, toId) => {
      const from = resolve(fromId);
      const to = toId ? resolve(toId).growth.targetId : cruxId;
      return diffSnapshots(from.growth.targetId, to, deps);
    },
  };
}
