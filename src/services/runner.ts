import {
  closureFor,
  discoverWorkspace,
  type Workspace,
  type WorkspaceService,
} from '@/services/workspace';
import { compose, composeRunner, runningServices, type ComposeRunner } from '@/services/containers';
import { projectState, startProject, stopProject } from '@/services/project-runner';

/**
 * Conducting a workspace (ADR 0053).
 *
 * The Runner owns the configuration and the Cruxes own what is running, so
 * everything here calls the same functions a bench or the collaborator calls.
 * It starts a closure in order, reports what happened, and never stops
 * something nobody asked about.
 */
export interface RunningRow {
  name: string;
  /** What Docker or the process runner says, not what we hoped. */
  state: string;
  health?: string;
  port?: number;
  from: 'stack' | 'source';
}

export interface WorkspaceStatus {
  runner: ComposeRunner | null;
  services: RunningRow[];
}

export interface ActionResult {
  ok: boolean;
  /** What happened, in order, for the page and the collaborator alike. */
  lines: string[];
}

/** Everything running in this workspace, asked of the things that own it. */
export async function workspaceStatus(cruxId: string): Promise<WorkspaceStatus> {
  const workspace = await discoverWorkspace(cruxId);
  const runner = await composeRunner();
  const rows: RunningRow[] = [];

  // The Stack answers for every container at once.
  const stackCruxId = workspace.services.find((s) => s.stackCruxId)?.stackCruxId;
  if (stackCruxId && runner) {
    try {
      for (const row of await runningServices(stackCruxId))
        rows.push({
          name: row.service,
          state: row.state,
          health: row.health,
          from: 'stack',
        });
    } catch {
      /* a stack that cannot be asked is simply not running */
    }
  }

  // Each source-run service answers for itself.
  for (const service of workspace.services) {
    if (service.from !== 'source' || !service.projectCruxId) continue;
    const run = await projectState(service.projectCruxId);
    // A source service replaces the container row of the same name.
    const existing = rows.findIndex((row) => row.name === service.name);
    if (existing >= 0) rows.splice(existing, 1);
    if (run.status !== 'idle')
      rows.push({
        name: service.name,
        state: run.status,
        port: run.port,
        from: 'source',
      });
  }

  return { runner, services: rows };
}

/** The services to act on: what was asked for, plus everything it needs. */
function planFor(workspace: Workspace, names: string[]): WorkspaceService[] {
  const wanted = closureFor(workspace.services, names);
  const byName = new Map(workspace.services.map((s) => [s.name, s]));
  return wanted.map((name) => byName.get(name)!).filter(Boolean);
}

/**
 * Start these services and what they need, depended-on first.
 *
 * Containers go through Compose in one call so it can apply its own
 * `depends_on` conditions and wait for health; source-run services follow,
 * because they usually want the database that the containers just became.
 */
export async function startWorkspace(cruxId: string, names: string[]): Promise<ActionResult> {
  const workspace = await discoverWorkspace(cruxId);
  const plan = planFor(workspace, names);
  if (!plan.length) return { ok: false, lines: ['Nothing to start.'] };
  const lines: string[] = [];
  let ok = true;

  const fromStack = plan.filter((s) => s.from === 'stack' && s.stackCruxId);
  if (fromStack.length) {
    const stackCruxId = fromStack[0]!.stackCruxId!;
    const profiles = [...new Set(fromStack.flatMap((s) => s.profiles))];
    for (const service of fromStack) {
      // One call per service so Compose starts exactly the closure, not the
      // whole file — the service it was asked for, with its own conditions.
      const run = await compose(stackCruxId, 'up', {
        service: service.name,
        profiles,
        wait: !service.task,
      });
      ok = ok && run.code === 0;
      lines.push(
        run.code === 0
          ? `${service.name}: up`
          : `${service.name}: did not start (exit ${run.code})`,
      );
    }
  }

  for (const service of plan.filter((s) => s.from === 'source')) {
    if (!service.projectCruxId || !service.script) {
      lines.push(`${service.name}: nothing to run — it has no script yet`);
      ok = false;
      continue;
    }
    try {
      const run = await startProject(
        service.projectCruxId,
        // The folder is the Project Crux's own; startProject refuses one that
        // was never chosen, which is the rule that keeps this safe.
        (await projectFolder(service.projectCruxId)) ?? '',
        service.script,
        { port: service.ports[0]?.host },
      );
      lines.push(`${service.name}: ${run.status}${run.port ? ` on ${run.port}` : ''}`);
      ok = ok && run.status !== 'crashed';
    } catch (error) {
      lines.push(`${service.name}: ${(error as Error)?.message ?? error}`);
      ok = false;
    }
  }

  return { ok, lines };
}

/** Stop these services. Only these — never what they depend on. */
export async function stopWorkspace(cruxId: string, names: string[]): Promise<ActionResult> {
  const workspace = await discoverWorkspace(cruxId);
  const byName = new Map(workspace.services.map((s) => [s.name, s]));
  const lines: string[] = [];
  let ok = true;

  for (const name of names) {
    const service = byName.get(name);
    if (!service) continue;
    try {
      if (service.from === 'source' && service.projectCruxId) {
        await stopProject(service.projectCruxId);
        lines.push(`${name}: stopped`);
      } else if (service.stackCruxId) {
        const run = await compose(service.stackCruxId, 'stop', { service: name });
        ok = ok && run.code === 0;
        lines.push(run.code === 0 ? `${name}: stopped` : `${name}: exit ${run.code}`);
      }
    } catch (error) {
      lines.push(`${name}: ${(error as Error)?.message ?? error}`);
      ok = false;
    }
  }

  return { ok, lines };
}

/** The folder a Project Crux points at, from its own record. */
async function projectFolder(cruxId: string): Promise<string | null> {
  const { getServices } = await import('@/services');
  const { pathOf } = await import('@/lib/artifact-path');
  const artifacts = await getServices().artifact.findByResource('crux', cruxId);
  const doc = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === 'project.json');
  if (!doc) return null;
  try {
    const record = JSON.parse(await (await getServices().artifact.downloadBlob(doc.id)).text());
    return typeof record.folder === 'string' ? record.folder : null;
  } catch {
    return null;
  }
}

/**
 * Which open Cruxes are Runners.
 *
 * The workspace tools are offered where they mean something and nowhere else.
 * The proxy records it when a workspace opens.
 */
const runnerCruxes = new Set<string>();

export function markRunnerCrux(cruxId: string, isRunner: boolean): void {
  if (isRunner) runnerCruxes.add(cruxId);
  else runnerCruxes.delete(cruxId);
}

export function isRunnerCrux(cruxId?: string): boolean {
  return !!cruxId && runnerCruxes.has(cruxId);
}
