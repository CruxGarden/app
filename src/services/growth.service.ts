import { getServices } from '@/services';
import { useCruxStore } from '@/stores/cruxStore';
import type { Attachment, ChatMessage } from '@/api/types';

/** Detect the "primary" artifact for preview/thumbnail purposes */
function detectPreviewArtifact(artifacts: Attachment[]): {
  type: 'html' | 'image' | 'markdown' | 'code' | 'text';
  path: string;
  attachmentId: string;
  mimeType: string;
} | null {
  if (artifacts.length === 0) return null;

  const indexHtml = artifacts.find((a) => {
    const p = (a.meta?.path || a.filename || '').toLowerCase();
    return p === 'index.html' || p.endsWith('/index.html');
  });
  if (indexHtml) {
    return {
      type: 'html',
      path: (indexHtml.meta?.path || indexHtml.filename) as string,
      attachmentId: indexHtml.id,
      mimeType: indexHtml.mimeType,
    };
  }

  const firstImage = artifacts.find((a) => a.mimeType?.startsWith('image/'));
  if (firstImage) {
    return {
      type: 'image',
      path: (firstImage.meta?.path || firstImage.filename) as string,
      attachmentId: firstImage.id,
      mimeType: firstImage.mimeType,
    };
  }

  const readme = artifacts.find((a) => {
    const p = (a.meta?.path || a.filename || '').toLowerCase();
    return p === 'readme.md' || p.endsWith('/readme.md');
  });
  if (readme) {
    return {
      type: 'markdown',
      path: (readme.meta?.path || readme.filename) as string,
      attachmentId: readme.id,
      mimeType: readme.mimeType,
    };
  }

  const firstText = artifacts.find((a) => a.encoding === 'utf-8');
  if (firstText) {
    const mime = firstText.mimeType || '';
    const isCode =
      mime.includes('javascript') ||
      mime.includes('python') ||
      mime.includes('css') ||
      mime.includes('json') ||
      mime.includes('xml');
    return {
      type: isCode ? 'code' : 'text',
      path: (firstText.meta?.path || firstText.filename) as string,
      attachmentId: firstText.id,
      mimeType: firstText.mimeType,
    };
  }

  return null;
}

/** Build a short summary prompt for the AI */
function buildSummaryPrompt(messages: ChatMessage[], artifactNames: string[], previousSummary?: string): string {
  const recent = messages.slice(-20);
  const convo = recent
    .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 300) : '[tool use]'}`)
    .join('\n');

  const artifacts = artifactNames.length > 0
    ? `\nArtifacts: ${artifactNames.join(', ')}`
    : '';

  const previousContext = previousSummary
    ? `\nPrevious snapshot summary: "${previousSummary}"\nDescribe only what CHANGED or was ADDED since then — do not repeat what was already done.`
    : '';

  return `Summarize what was accomplished in this conversation segment in 1-2 short sentences. Focus on what changed, not what already existed. Be specific about the nature of the change (e.g. "changed X to Y", "added Z", "restyled the header").${artifacts}${previousContext}\n\nConversation:\n${convo}`;
}

/** Fire-and-forget AI summary for a snapshot */
async function generateSnapshotSummary(
  dimensionId: string,
  messages: ChatMessage[],
  artifactNames: string[],
  model: string,
  previousSummary?: string,
): Promise<void> {
  try {
    const { getApiKey } = await import('@/ai/keys');
    const { getProviderForModel } = await import('@/ai/providers');
    const { getAdapter } = await import('@/ai/adapters');

    const providerId = getProviderForModel(model);
    const apiKey = await getApiKey(providerId);
    if (!apiKey) return;

    const adapter = await getAdapter(model);
    const response = await adapter.stream({
      apiKey,
      systemPrompt: 'You are a concise technical summarizer. Respond with only the summary, no preamble.',
      messages: [{ role: 'user', content: [{ type: 'text', text: buildSummaryPrompt(messages, artifactNames, previousSummary) }] }],
      model,
      tools: [],
      onText: () => {},
      maxTokens: 150,
    });

    const summary = response.textContent.trim();
    if (!summary) return;

    const { dimension } = getServices();
    await dimension.update(dimensionId, { meta: { summary } });

    const { growths } = useCruxStore.getState();
    const updated = growths.map((g) =>
      g.id === dimensionId ? { ...g, meta: { ...g.meta, summary } } : g,
    );
    useCruxStore.setState({ growths: updated });
  } catch (err) {
    console.warn('Failed to generate snapshot summary:', err);
  }
}

export interface CreateSnapshotOptions {
  label?: string;
  silent?: boolean; // skip AI summary generation
}

/**
 * Create a snapshot of the current workspace.
 * Clones all artifacts, creates a growth dimension, segments messages.
 * Can be called from hooks, store actions, or auto-snapshot triggers.
 */
export async function createSnapshot(options: CreateSnapshotOptions = {}): Promise<void> {
  const { label, silent } = options;
  const state = useCruxStore.getState();
  const { crux } = state;
  if (!crux) return;

  const { crux: cruxService, attachment, dimension } = getServices();
  const { growthCount, messages, growths, artifacts, messageSegmentStart } = state;

  // Compute snapshot fingerprint
  const fingerprint = await attachment.computeSnapshotFingerprint(crux.id);

  // Determine parent: use activeBranch if set (after branching), otherwise most recent snapshot
  const activeBranch = crux.meta?.settings?.activeBranch as string | undefined;
  const parentCruxId = activeBranch
    || (growths.length > 0 ? growths[growths.length - 1]!.targetId : null);

  // Create snapshot crux with only this segment's messages (not the full conversation)
  // Also store cumulativeMessageCount so viewSnapshot can truncate correctly
  const segmentMessages = messages.slice(messageSegmentStart);
  const snapshotSlug = `snapshot-${growthCount + 1}-${Date.now().toString(36)}`;
  const snapshotCrux = await cruxService.create({
    slug: snapshotSlug,
    title: label || crux.title || 'Snapshot',
    type: 'crux',
    kind: 'snapshot',
    meta: {
      fingerprint,
      messages: segmentMessages,
      cumulativeMessageCount: messages.length,
      parentCruxId,
    },
  });

  // Clone all workspace artifacts to the snapshot
  await attachment.cloneArtifactsToSnapshot(crux.id, snapshotCrux.id);

  // Detect preview from snapshot's artifacts
  const snapshotArtifacts = await attachment.findByResource('crux', snapshotCrux.id);
  const preview = detectPreviewArtifact(snapshotArtifacts);
  const artifactNames = snapshotArtifacts
    .filter((a) => !a.filename?.endsWith('.keep'))
    .map((a) => (a.meta?.path || a.filename) as string);

  // Check for a user-captured thumbnail
  const thumbArtifact = snapshotArtifacts.find((a) => {
    const p = (a.meta?.path || a.filename || '').toLowerCase();
    return p === 'preview.jpg';
  });

  // Create growth dimension
  const growth = await dimension.create({
    sourceId: crux.id,
    targetId: snapshotCrux.id,
    type: 'growth',
    weight: growthCount + 1,
    meta: {
      artifactCount: artifacts.length,
      ...(label ? { label } : {}),
      ...(preview ? { preview } : {}),
      ...(thumbArtifact ? { thumbnailId: thumbArtifact.id } : {}),
    },
  });

  const { addGrowth, saveMeta } = useCruxStore.getState();
  addGrowth(growth);

  // Advance segment start so saveMeta only persists new messages going forward
  const { messages: currentMessages } = useCruxStore.getState();
  useCruxStore.setState({ messageSegmentStart: currentMessages.length });
  await saveMeta();

  // Fire-and-forget AI summary
  if (!silent) {
    const model = crux.meta?.settings?.model || 'claude-sonnet-4-20250514';
    const previousSummary = growths.length > 0
      ? (growths[growths.length - 1]!.meta?.summary as string | undefined)
      : undefined;
    generateSnapshotSummary(growth.id, messages, artifactNames, model, previousSummary);
  }
}
