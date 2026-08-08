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
import { pathOf } from '@/lib/artifact-path';

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

/** Detect the "primary" artifact for preview/thumbnail purposes */
export function detectPreviewArtifact(artifacts: Artifact[]): PreviewArtifactInfo | null {
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
  const { label } = options;

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
    .filter((a) => !a.filename?.endsWith('.keep'))
    .map((a) => pathOf(a));
  const thumbArtifact = snapshotArtifacts.find((a) => pathOf(a).toLowerCase() === 'preview.jpg');

  const growth = await deps.dimension.create({
    sourceId: crux.id,
    targetId: snapshotCrux.id,
    type: 'growth',
    weight: growthCount + 1,
    meta: {
      artifactCount,
      ...(label ? { label } : {}),
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
