/**
 * What a Schedule does when it fires (GARDEN-SCHEDULER-PLAN §2): the
 * actions, one after another, each reporting into the Alerts inbox so a
 * firing is never silent. A cue plays through the engine directly — an
 * alarm the person set is not a surprise, so it does not wait for the
 * sound opt-in the Mood's cues respect. A prompt opens the Crux's workspace
 * and submits a Background Turn; a tool call runs a garden tool on the Crux
 * as `requestedBy: schedule`, so every snapshot it takes says so.
 */
import { raiseAlert } from './alerts';
import { resolveCue } from './cues';
import type { Schedule, Action } from './schedules';

export interface FiringContext {
  reason: string;
  missed: boolean;
  now: Date;
  /** The Crux the trigger was about, when it was about one. */
  cruxId?: string;
}

/** Test seam: the app wires the real workspace and tool machinery. */
export interface ActionRuntime {
  playCue(patch: object, times: number): Promise<void>;
  notify(title: string, body: string): void;
  prompt(cruxId: string, prompt: string): Promise<void>;
  tool(cruxId: string, tool: string, input: Record<string, unknown>): Promise<string>;
  cruxTitle(cruxId: string): string;
}

let runtime: ActionRuntime = {
  async playCue(patch, times) {
    const { playCuePatch, cueLength } = await import('@/audio/cue-synth');
    const p = patch as Parameters<typeof playCuePatch>[0];
    for (let i = 0; i < times; i++) {
      await playCuePatch(p);
      if (i < times - 1) await new Promise((r) => setTimeout(r, (cueLength(p) + 0.15) * 1000));
    }
  },
  notify(title, body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body });
    } catch {
      /* the inbox has it */
    }
  },
  async prompt(cruxId, prompt) {
    const { openWorkspace } = await import('@/stores/workspaceRegistry');
    const { turnsFor } = await import('./turns');
    const w = await openWorkspace(cruxId);
    await turnsFor(w.data).submitTurn(prompt);
  },
  async tool(cruxId, tool, input) {
    const { openWorkspace } = await import('@/stores/workspaceRegistry');
    const { createToolExecutor } = await import('@/ai/tools');
    await openWorkspace(cruxId);
    const execute = createToolExecutor(cruxId, undefined, undefined, { requestedBy: 'schedule' });
    const result = await execute(tool, input);
    return typeof result === 'string'
      ? result
      : result.map((part) => (part.type === 'text' ? part.text : '[image]')).join('\n');
  },
  cruxTitle(cruxId) {
    return cruxId;
  },
};

export function setActionRuntime(next: Partial<ActionRuntime>) {
  runtime = { ...runtime, ...next };
}

const excerpt = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function runOne(s: Schedule, a: Action, index: number, ctx: FiringContext): Promise<void> {
  const key = `schedule:${s.id}:${index}:${ctx.now.toISOString()}`;
  switch (a.kind) {
    case 'alert':
      raiseAlert({
        key,
        kind: 'reminder',
        title: a.title?.trim() || s.title,
        body: [a.body?.trim(), ctx.reason].filter(Boolean).join(' '),
        cruxId: ctx.cruxId,
        at: ctx.now.toISOString(),
      });
      return;
    case 'cue': {
      const patch = resolveCue(a.cue as string);
      if (patch) await runtime.playCue(patch, Math.max(1, Math.min(10, a.times ?? 1)));
      return;
    }
    case 'notify':
      runtime.notify(s.title, ctx.reason);
      return;
    case 'prompt': {
      try {
        await runtime.prompt(a.cruxId, a.prompt);
        raiseAlert({
          key,
          kind: 'run',
          title: `${s.title} · ${runtime.cruxTitle(a.cruxId)}`,
          body: `Sent to the collaborator. ${ctx.reason} The result shows in Tending when it is ready.`,
          cruxId: a.cruxId,
          at: ctx.now.toISOString(),
        });
      } catch (err) {
        raiseAlert({
          key,
          kind: 'run',
          title: `${s.title} · could not run`,
          body: excerpt(err instanceof Error ? err.message : String(err)),
          cruxId: a.cruxId,
          at: ctx.now.toISOString(),
        });
      }
      return;
    }
    case 'tool': {
      try {
        const out = await runtime.tool(a.cruxId, a.tool, a.input);
        raiseAlert({
          key,
          kind: 'run',
          title: `${s.title} · ${a.tool}`,
          body: excerpt(out || 'Done.'),
          cruxId: a.cruxId,
          at: ctx.now.toISOString(),
        });
      } catch (err) {
        raiseAlert({
          key,
          kind: 'run',
          title: `${s.title} · ${a.tool} failed`,
          body: excerpt(err instanceof Error ? err.message : String(err)),
          cruxId: a.cruxId,
          at: ctx.now.toISOString(),
        });
      }
      return;
    }
  }
}

/** Run every action, in order; one failing never stops the next. */
export async function runScheduleActions(s: Schedule, ctx: FiringContext): Promise<void> {
  for (const [index, a] of s.actions.entries()) {
    try {
      await runOne(s, a, index, ctx);
    } catch (err) {
      console.warn(`[schedules] ${s.title}: ${a.kind} failed`, err);
    }
  }
}
