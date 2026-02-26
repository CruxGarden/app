import { useEffect, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { streamChat } from '@/api/ai';
import { cruxes } from '@/api';
import type { ChatMessage, GateSnapshot, CruxSummary } from '@/api/types';

// ── Prompt templates ─────────────────────────────────────

const SNAPSHOT_PROMPT = `Generate a gate snapshot capturing the key decision that was made. Follow this EXACT format (every field required, 1-2 sentences max each):

GATE: [short label for this decision point]
STATE: [what exists now]
DECISION: [what was chosen]
REJECTED: [what was considered but not chosen]
REASON: [why this choice was made]
ARTIFACTS: [what files/outputs changed]
OPEN: [unresolved questions or tensions]

Respond ONLY with the snapshot in this format. No preamble, no explanation.`;

function buildSummaryPrompt(
  existing: CruxSummary | null,
  snapshot: GateSnapshot,
): string {
  const current = existing
    ? `Current summary:\nCRUX: ${existing.crux}\nPURPOSE: ${existing.purpose}\nSTAGE: ${existing.stage}\nTHEMES: ${existing.themes}\nSTACK: ${existing.stack}`
    : 'No summary exists yet. Create one from scratch.';

  return `Update the living crux summary based on this new gate snapshot. Follow this EXACT format:

CRUX: [project name]
PURPOSE: [what this is trying to achieve]
STAGE: [where we are in the journey]
THEMES: [recurring ideas, patterns, tensions]
STACK: [tools, technologies, materials involved]

${current}

New gate snapshot:
GATE: ${snapshot.gate}
STATE: ${snapshot.state}
DECISION: ${snapshot.decision}
REJECTED: ${snapshot.rejected}
REASON: ${snapshot.reason}
ARTIFACTS: ${snapshot.artifacts}
OPEN: ${snapshot.open}

Respond ONLY with the updated summary in this format. No preamble, no explanation.`;
}

// ── Parsers ──────────────────────────────────────────────

function parseSnapshot(text: string): GateSnapshot | null {
  const fields: Record<string, string> = {};
  const keys = ['gate', 'state', 'decision', 'rejected', 'reason', 'artifacts', 'open'];

  for (const line of text.split('\n')) {
    const match = line.match(/^(GATE|STATE|DECISION|REJECTED|REASON|ARTIFACTS|OPEN):\s*(.+)/i);
    if (match && match[1] && match[2]) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }
  }

  // All fields required
  if (keys.every((k) => fields[k])) {
    return fields as unknown as GateSnapshot;
  }
  return null;
}

function parseSummary(text: string): CruxSummary | null {
  const fields: Record<string, string> = {};
  const keys = ['crux', 'purpose', 'stage', 'themes', 'stack'];

  for (const line of text.split('\n')) {
    const match = line.match(/^(CRUX|PURPOSE|STAGE|THEMES|STACK):\s*(.+)/i);
    if (match && match[1] && match[2]) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }
  }

  if (keys.every((k) => fields[k])) {
    return fields as unknown as CruxSummary;
  }
  return null;
}

// ── Stream text collector ────────────────────────────────

async function collectStreamText(
  cruxId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model?: string,
): Promise<string> {
  let text = '';
  await streamChat(cruxId, messages, (event) => {
    if (event.event === 'text') text += event.data.content;
  }, model);
  return text;
}

// ── Format conversation excerpt ──────────────────────────

function formatConversation(messages: ChatMessage[], fromIndex: number): string {
  return messages
    .slice(fromIndex)
    .map((m) => {
      const prefix = m.role === 'user' ? 'User' : 'Assistant';
      let text = `${prefix}: ${m.content}`;
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          if (tc.name === 'write_file') {
            text += `\n[Tool: write_file → ${(tc.input as Record<string, string>).path}]`;
          }
        }
      }
      return text;
    })
    .join('\n\n');
}

// ── Hook ─────────────────────────────────────────────────

export function useGates() {
  const {
    crux,
    summary,
    gateCount,
    gates,
    isStreaming,
    isCreatingGate,
    pendingGateCreation,
    loadGates,
    addGate,
    setSummary,
    setGateCreating,
    setPendingGateCreation,
  } = useCruxStore();

  const creatingRef = useRef(false);

  // Load gates when crux loads
  useEffect(() => {
    if (crux) loadGates();
  }, [crux?.id, loadGates]);

  // Watch for pending gate creation (after streaming completes)
  useEffect(() => {
    if (!pendingGateCreation || isStreaming || creatingRef.current || !crux) return;

    creatingRef.current = true;
    setPendingGateCreation(false);
    setGateCreating(true);

    createGate().finally(() => {
      creatingRef.current = false;
      setGateCreating(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGateCreation, isStreaming]);

  async function createGate() {
    if (!crux) return;

    const model = crux.meta?.settings?.model;
    const currentGateCount = useCruxStore.getState().gateCount;
    const currentMessages = useCruxStore.getState().messages;
    const currentSummary = useCruxStore.getState().summary;
    const currentArtifacts = useCruxStore.getState().artifacts;

    // Determine message range (messages since last gate)
    const lastGateMessageTo = currentGateCount > 0
      ? findLastGateMessageEnd()
      : 0;
    const fromIndex = Math.max(0, lastGateMessageTo);

    try {
      // Step 1: Generate gate snapshot
      const conversationExcerpt = formatConversation(currentMessages, fromIndex);
      const snapshotResponse = await collectStreamText(
        crux.id,
        [{
          role: 'user' as const,
          content: `The following is a recent conversation excerpt. Based on it, generate a gate snapshot.\n\n---\n${conversationExcerpt}\n---\n\n${SNAPSHOT_PROMPT}`,
        }],
        model,
      );

      const snapshot = parseSnapshot(snapshotResponse);
      if (!snapshot) {
        console.warn('[useGates] Failed to parse snapshot from AI response');
        return;
      }

      // Step 2: Create gate crux
      const gateNumber = currentGateCount + 1;
      const gateSlug = `gate-${gateNumber}-${Date.now().toString(36)}`;
      const gateCrux = await cruxes.create({
        slug: gateSlug,
        title: snapshot.gate,
        type: 'gate',
        data: `${snapshot.state} ${snapshot.decision}`,
        meta: {
          snapshot,
          artifactRefs: currentArtifacts.map((a) => a.id),
          messageRange: { from: fromIndex, to: currentMessages.length },
          parentCruxId: crux.id,
        },
      });

      // Step 3: Link gate via dimension
      const dimension = await cruxes.createDimension(crux.id, {
        targetId: gateCrux.id,
        type: 'gate',
        weight: gateNumber,
      });

      // Add to local state immediately
      addGate({ ...dimension, target: { id: gateCrux.id, slug: gateSlug, title: snapshot.gate, data: gateCrux.data } });

      // Step 4: Generate updated summary
      const summaryResponse = await collectStreamText(
        crux.id,
        [{
          role: 'user' as const,
          content: buildSummaryPrompt(currentSummary, snapshot),
        }],
        model,
      );

      const newSummary = parseSummary(summaryResponse);

      // Step 5: Update parent crux meta
      const updatedMeta = {
        ...crux.meta,
        messages: useCruxStore.getState().messages,
        summary: newSummary || currentSummary,
        gateCount: gateNumber,
      };
      await cruxes.update(crux.id, { meta: updatedMeta });

      if (newSummary) setSummary(newSummary);

      // Step 6: Every 10 gates, do a full reconciliation
      if (gateNumber % 10 === 0) {
        reconcileSummary(gateNumber, model);
      }
    } catch (err) {
      console.error('[useGates] Gate creation failed:', err);
    }
  }

  function findLastGateMessageEnd(): number {
    // The gate's meta.messageRange.to would be ideal but we don't embed
    // full meta in the dimension target. Fall back to full context.
    return 0;
  }

  async function reconcileSummary(gateNumber: number, model?: string) {
    if (!crux) return;
    try {
      const allGates = useCruxStore.getState().gates;
      const snapshotChain = allGates
        .map((g, i) => {
          // Extract snapshot from embedded target data if available
          return `Gate ${i + 1}: ${g.target?.title || 'Untitled'}`;
        })
        .join('\n');

      const response = await collectStreamText(
        crux.id,
        [{
          role: 'user' as const,
          content: `Regenerate the crux summary from scratch based on the complete gate chain below. Follow this EXACT format:\n\nCRUX: [project name]\nPURPOSE: [what this is trying to achieve]\nSTAGE: [where we are]\nTHEMES: [recurring ideas, patterns]\nSTACK: [tools, technologies]\n\nGate chain:\n${snapshotChain}\n\nRespond ONLY with the summary. No preamble.`,
        }],
        model,
      );

      const reconciled = parseSummary(response);
      if (reconciled) {
        setSummary(reconciled);
        await cruxes.update(crux.id, {
          meta: { ...crux.meta, summary: reconciled, gateCount: gateNumber },
        });
      }
    } catch (err) {
      console.error('[useGates] Summary reconciliation failed:', err);
    }
  }

  return {
    gates,
    gateCount,
    isCreatingGate,
    summary,
  };
}
