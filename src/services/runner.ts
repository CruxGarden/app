import {
  closureFor,
  discoverWorkspace,
  type Workspace,
  type WorkspaceService,
} from '@/services/workspace';
import {
  compose,
  composeRunner,
  runningServices,
  readLocalFile,
  writeLocalFile,
  portsInUse,
  LOCAL_ENV,
  LOCAL_COMPOSE,
  type ComposeRunner,
} from '@/services/containers';
import {
  assignPorts,
  connectionsFor,
  envText,
  localComposeFor,
  parseEnv,
  type PortAssignment,
} from '@/services/workspace-config';
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

/**
 * Settle the workspace's configuration, and write it where things will read it.
 *
 * Ports are assigned from a live scan and then remembered, so they stick. What
 * this machine chose goes to `.crux/local.env` and `.crux/local.compose.yaml`,
 * which are never ingested and so never arrive on someone else's machine — the
 * shared `compose.yaml` and `.env` are left alone.
 *
 * It runs on open and before every start, because a port can be taken by
 * something outside the workspace between one and the next.
 */
export async function settleConfiguration(cruxId: string): Promise<PortAssignment[]> {
  const workspace = await discoverWorkspace(cruxId);
  const stackCruxId = workspace.services.find((s) => s.stackCruxId)?.stackCruxId;
  const wanted = workspace.services.flatMap((s) => s.ports.map((p) => p.host)).filter(Boolean);

  // What this machine chose before, kept wherever it still can be.
  const remembered = stackCruxId
    ? Object.fromEntries(
        Object.entries(parseEnv(await readLocalFile(stackCruxId, LOCAL_ENV)))
          .filter(([name]) => name.endsWith('_PORT'))
          .map(([name, value]) => [name.replace(/_PORT$/, '').toLowerCase(), Number(value)]),
      )
    : {};
  const byService: Record<string, number> = {};
  for (const service of workspace.services)
    for (const [name, port] of Object.entries(remembered))
      if (service.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') === name && port)
        byService[service.name] = port;

  const assigned = assignPorts(workspace.services, {
    taken: await portsInUse(wanted),
    remembered: byService,
  });
  const ports = Object.fromEntries(assigned.map((a) => [a.service, a.port]));
  const fromSource = workspace.services.filter((s) => s.from === 'source').map((s) => s.name);

  if (stackCruxId) {
    // Containers talk to each other by service name; this file is what a
    // container needs in order to reach something running from source.
    await writeLocalFile(
      stackCruxId,
      LOCAL_ENV,
      envText(connectionsFor(workspace.services, ports, { consumer: 'container' }), [
        'Written by the Runner. This machine only: never ingested, never shared.',
        'Edit it in the Runner rather than here; it is rewritten on every start.',
      ]),
    );
    const local = localComposeFor(workspace.services, ports, fromSource);
    if (local) await writeLocalFile(stackCruxId, LOCAL_COMPOSE, local);
  }

  return assigned;
}

/** What a service run from source needs in order to reach the rest. */
async function hostEnvironment(cruxId: string): Promise<Record<string, string>> {
  const workspace = await discoverWorkspace(cruxId);
  const assigned = await settleConfiguration(cruxId);
  const ports = Object.fromEntries(assigned.map((a) => [a.service, a.port]));
  return connectionsFor(workspace.services, ports, { consumer: 'host' });
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
  // Settle first: a port may have been taken since the workspace was opened.
  const assigned = await settleConfiguration(cruxId);
  const ports = Object.fromEntries(assigned.map((a) => [a.service, a.port]));
  const moved = assigned.filter((a) => a.moved);
  const workspace = await discoverWorkspace(cruxId);
  const plan = planFor(workspace, names);
  if (!plan.length) return { ok: false, lines: ['Nothing to start.'] };
  const lines: string[] = [];
  let ok = true;
  for (const port of moved) lines.push(`${port.service}: on ${port.port} — ${port.moved}`);

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
        {
          port: ports[service.name] ?? service.ports[0]?.host,
          // Addresses as they are from here, so the code reaches the stack.
          env: await hostEnvironment(cruxId),
        },
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

/**
 * One log across the workspace, tagged by service.
 *
 * The ordering between services is usually the bug, so the lines are
 * interleaved rather than kept in separate panels — and the recent output is
 * written into the Runner's own folder, so a crash is still readable after a
 * reopen (ADR 0053).
 */
export interface LogLine {
  service: string;
  from: 'stack' | 'source';
  text: string;
}

export async function workspaceLog(cruxId: string, tail = 200): Promise<LogLine[]> {
  const workspace = await discoverWorkspace(cruxId);
  const lines: LogLine[] = [];

  const stackCruxId = workspace.services.find((s) => s.stackCruxId)?.stackCruxId;
  if (stackCruxId) {
    try {
      const run = await compose(stackCruxId, 'logs', { tail });
      for (const raw of run.output.split('\n')) {
        if (!raw.trim()) continue;
        // Compose prefixes each line with the service it came from.
        const match = /^([\w.-]+)\s*\|\s?(.*)$/.exec(raw);
        lines.push({
          service: match?.[1] ?? 'stack',
          from: 'stack',
          text: match?.[2] ?? raw,
        });
      }
    } catch {
      /* a stack that cannot be asked has nothing to say */
    }
  }

  for (const service of workspace.services) {
    if (service.from !== 'source' || !service.projectCruxId) continue;
    const run = await projectState(service.projectCruxId);
    for (const raw of (run.log || '').split('\n').slice(-tail)) {
      if (!raw.trim()) continue;
      lines.push({ service: service.name, from: 'source', text: raw });
    }
  }

  return lines;
}

/** The folder a Link Crux points at, from its own record. */
async function projectFolder(cruxId: string): Promise<string | null> {
  const { getServices } = await import('@/services');
  const { pathOf } = await import('@/lib/artifact-path');
  const artifacts = await getServices().artifact.findByResource('crux', cruxId);
  const doc = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === 'link.json');
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
