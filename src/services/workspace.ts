import type { Crux } from '@/api/types';
import { getServices } from '@/services';
import { listCruxspaces, type Cruxspace } from '@/services/cruxspaces';
import { findWorkingCopy } from '@/services/working-copies';
import { pathOf } from '@/lib/artifact-path';
import { inspectCompose, type ComposeService } from '@/services/containers';

/**
 * A workspace: what a Cruxspace can run (ADR 0053).
 *
 * The Runner owns the configuration and the Cruxes own what is running, so
 * this is the discovery half — it reads the Cruxspace and answers what could
 * run, from where, and what each thing needs. It starts nothing.
 *
 * A row is a **service**, not a Crux. The Stack Crux contributes one per
 * Compose service; a Project Crux contributes the service it **provides**, and
 * its mere presence means that service runs **from source** rather than as a
 * container. A Project Crux whose folder has never been chosen on this machine
 * cannot run, so the row falls back to the Stack and says why.
 */
export type ServiceFrom = 'stack' | 'source';

export interface WorkspaceService {
  /** The name everything agrees on: the Compose service name. */
  name: string;
  from: ServiceFrom;
  /** Why it is not running from source although a Project Crux offers it. */
  fellBack?: string;
  about?: string;
  image?: string;
  /** Ports as the files declare them; the Runner assigns the real ones. */
  ports: { host: number; container?: number }[];
  dependsOn: string[];
  profiles: string[];
  /** Whether it stays up, or runs to completion — a task. */
  task: boolean;
  stackCruxId?: string;
  projectCruxId?: string;
  /** The script a source-run service starts with. */
  script?: string;
}

export interface WorkspaceMember {
  cruxId: string;
  title: string;
  kind: 'stack' | 'project' | 'runner' | 'other';
  template: string | null;
}

export interface Workspace {
  cruxspaceId: string | null;
  name: string;
  members: WorkspaceMember[];
  services: WorkspaceService[];
  /** What stopped the picture being complete, said plainly rather than thrown. */
  notes: string[];
}

/** What a Project Crux records about itself, as far as a workspace cares. */
export interface ProjectRecord {
  folder?: string;
  script?: string;
  /** The Compose service this checkout stands in for. */
  provides?: string;
  /** What it needs up before it starts, beyond what Compose knows. */
  needs?: string[];
  /** Scripts that run to completion rather than staying up. */
  tasks?: string[];
  port?: number;
}

const TEMPLATES: Record<string, WorkspaceMember['kind']> = {
  'stack-app': 'stack',
  'project-app': 'project',
  'runner-app': 'runner',
};

export function kindOf(crux: { meta?: Record<string, unknown> } | null | undefined) {
  const template = typeof crux?.meta?.template === 'string' ? crux.meta.template : null;
  return { template, kind: (template && TEMPLATES[template]) || 'other' };
}

/**
 * One list of services from the Stack's Compose services and the Projects.
 *
 * Pure, so the rule that matters — a Project takes over the service it
 * provides — is testable without a garden. A Project that provides nothing
 * Compose knows about is still a service; it simply has no container form.
 */
export function mergeServices(
  stack: { cruxId: string; services: ComposeService[] } | null,
  projects: { cruxId: string; record: ProjectRecord; runnable: boolean; reason?: string }[],
): WorkspaceService[] {
  const rows = new Map<string, WorkspaceService>();

  for (const service of stack?.services ?? []) {
    rows.set(service.name, {
      name: service.name,
      from: 'stack',
      about: service.about,
      image: service.image,
      ports: service.ports,
      dependsOn: service.dependsOn,
      profiles: service.profiles,
      // A Compose service told not to restart is a job, not a service.
      task: service.restart === 'no',
      stackCruxId: stack?.cruxId,
    });
  }

  for (const project of projects) {
    const name = project.record.provides?.trim();
    if (!name) continue;
    const existing = rows.get(name);
    const needs = project.record.needs ?? [];
    if (!project.runnable) {
      // The Crux is here but this machine cannot run it, so the container
      // form stands in — and the reason is carried rather than swallowed.
      if (existing) {
        existing.projectCruxId = project.cruxId;
        existing.fellBack = project.reason;
      }
      continue;
    }
    rows.set(name, {
      name,
      from: 'source',
      about: existing?.about,
      image: existing?.image,
      ports: existing?.ports ?? (project.record.port ? [{ host: project.record.port }] : []),
      // What Compose knew it needed, plus what only the project knows.
      dependsOn: [...new Set([...(existing?.dependsOn ?? []), ...needs])],
      profiles: existing?.profiles ?? [],
      task: false,
      stackCruxId: existing?.stackCruxId,
      projectCruxId: project.cruxId,
      script: project.record.script,
    });
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Everything that must run for these services to work, themselves included.
 *
 * Asking for one thing gets its closure and nothing else: what is already
 * running and unrelated is left alone, which is the Runner's habit everywhere.
 */
export function closureFor(services: WorkspaceService[], want: string[]): string[] {
  const byName = new Map(services.map((s) => [s.name, s]));
  const out = new Set<string>();
  const walk = (name: string) => {
    if (out.has(name)) return;
    const service = byName.get(name);
    if (!service) return; // a dependency on something no file describes
    out.add(name);
    for (const next of service.dependsOn) walk(next);
  };
  for (const name of want) walk(name);
  // Depended-on first, so a caller can start them in order.
  return [...out].sort((a, b) => {
    const aNeeds = byName.get(a)?.dependsOn ?? [];
    const bNeeds = byName.get(b)?.dependsOn ?? [];
    if (aNeeds.includes(b)) return 1;
    if (bNeeds.includes(a)) return -1;
    return aNeeds.length - bNeeds.length || a.localeCompare(b);
  });
}

/** The Cruxspace this Crux belongs to, by the rule the other tools use. */
async function spaceFor(cruxId: string): Promise<Cruxspace | null> {
  const copy = await findWorkingCopy(cruxId);
  const rootId = copy?.cruxId ?? cruxId;
  const spaces = await listCruxspaces();
  return spaces.find((space) => space.cruxIds.includes(rootId)) ?? null;
}

/** What a Project Crux records, read from its own `project.json`. */
async function projectRecord(cruxId: string): Promise<ProjectRecord> {
  const artifacts = await getServices().artifact.findByResource('crux', cruxId);
  const doc = artifacts.find((a) => a.type === 'artifact' && pathOf(a) === 'project.json');
  if (!doc) return {};
  try {
    return JSON.parse(await (await getServices().artifact.downloadBlob(doc.id)).text());
  } catch {
    return {};
  }
}

/**
 * Read the Cruxspace this Crux is in and say what it can run.
 *
 * Every failure is a note rather than an exception: a workspace with one
 * unreadable member is still worth showing.
 */
export async function discoverWorkspace(cruxId: string): Promise<Workspace> {
  const notes: string[] = [];
  const space = await spaceFor(cruxId);
  if (!space)
    return {
      cruxspaceId: null,
      name: '',
      members: [],
      services: [],
      notes: ['This Crux is not in a Cruxspace, so there is no workspace to run.'],
    };

  const all = (await getServices().crux.listAll()) as Crux[];
  const byId = new Map(all.map((crux) => [crux.id, crux]));
  const members: WorkspaceMember[] = space.cruxIds
    .map((id) => {
      const crux = byId.get(id);
      if (!crux) return null;
      const { template, kind } = kindOf(crux);
      return { cruxId: id, title: crux.title ?? '', kind, template };
    })
    .filter((m): m is WorkspaceMember => m !== null);

  const stackMember = members.find((m) => m.kind === 'stack');
  let stack: { cruxId: string; services: ComposeService[] } | null = null;
  if (stackMember) {
    try {
      const reading = await inspectCompose(stackMember.cruxId);
      stack = { cruxId: stackMember.cruxId, services: reading.services };
      for (const refusal of reading.refusals)
        if (!/^There is no /.test(refusal)) notes.push(`${stackMember.title}: ${refusal}`);
    } catch (error) {
      notes.push(`Could not read ${stackMember.title} — ${(error as Error)?.message ?? error}`);
    }
  }

  const projects = [];
  for (const member of members.filter((m) => m.kind === 'project')) {
    const record = await projectRecord(member.cruxId);
    const runnable = Boolean(record.folder);
    projects.push({
      cruxId: member.cruxId,
      record,
      runnable,
      reason: runnable ? undefined : 'no folder has been chosen for it on this machine',
    });
    if (record.provides && !runnable)
      notes.push(
        `${member.title} offers ${record.provides} from source, but no folder has been chosen for it here.`,
      );
  }

  return {
    cruxspaceId: space.id,
    name: space.name,
    members,
    services: mergeServices(stack, projects),
    notes,
  };
}
