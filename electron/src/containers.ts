/**
 * Containers: running a Crux's own stack with Docker Compose.
 *
 * A Stack Crux carries a `compose.yaml` in its Project Folder; the app starts
 * and stops it, and shows what is running. Growth versions the stack because
 * it is text, and export carries it to another machine.
 *
 * The seam is narrow on purpose:
 *
 *   · only `docker compose` (or `podman compose`), never bare `docker run`;
 *   · only the verbs below — no `exec`, no `cp`, no `build --output`;
 *   · the working directory is pinned to the Crux folder, and the project
 *     name is fixed to `crux-<cruxId>`, so `down` can only reach containers
 *     this Crux started;
 *   · the compose file is read and checked before every start.
 *
 * **The risk is the file, not the arguments.** A compose file can mount the
 * whole disk, take the host's network, or hand over the Docker socket — which
 * is root. `inspectCompose` refuses all of that before anything runs, and it
 * lives here, in the shell, where a page cannot reach it.
 */
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** The compose verbs a Crux may use. */
export const COMPOSE_VERBS = [
  'up',
  'down',
  'ps',
  'logs',
  'pull',
  'config',
  'stop',
  'start',
] as const;
export type ComposeVerb = (typeof COMPOSE_VERBS)[number];

export interface ComposeRunner {
  /** The program that answered: `docker` or `podman`. */
  program: string;
  version: string;
}

/**
 * One service, as the file describes it. Everything here is read from
 * `compose.yaml` so a bench can be built from any stack someone brings — the
 * page has no list of its own.
 */
export interface ComposeService {
  name: string;
  image?: string;
  /** The comment written above the service in the file, if any. */
  about?: string;
  /** Host ports the service asks for, with what they reach inside. */
  ports: { host: number; container?: number }[];
  /** Services it waits for. */
  dependsOn: string[];
  /** Whether the file gives it a healthcheck, so the bench can wait for it. */
  healthcheck: boolean;
  /** Its restart policy, as written — `no` marks a service meant to exit. */
  restart?: string;
  /** The names of its environment keys. Never the values. */
  envKeys: string[];
  /** Named volumes and paths it mounts, as written. */
  volumes: string[];
  /** Compose profiles it belongs to; empty means it always runs. */
  profiles: string[];
}

/**
 * A setting the stack reads, as `${NAME}` or `${NAME:-default}` in the file.
 * A default makes the stack work out of the box; a value in `.env` or the
 * Crux's secrets overrides it for this machine.
 */
export interface ComposeVariable {
  name: string;
  /** What the file falls back to, when it names one. */
  fallback?: string;
  /** Set in the Crux's `.env`. The value is not reported — only that it is set. */
  fromEnv: boolean;
}

export interface ComposeReading {
  services: ComposeService[];
  /** Why this file must not be started, if so. Empty means it may run. */
  refusals: string[];
  /** The files Compose will actually read, in the order it merges them. */
  files: string[];
  /** Every profile the stack names, so optional services can be offered. */
  profiles: string[];
  /** The settings it reads, with the defaults that make it work unchanged. */
  variables: ComposeVariable[];
}

let runnerCache: ComposeRunner | null | undefined;

function ask(program: string, args: string[], timeout = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(program, args, { timeout }, (error, stdout) => {
      resolve(error ? null : String(stdout || '').trim());
    });
  });
}

/**
 * Whether this machine can run a stack, and with what. Docker Desktop is not
 * free for larger companies and Podman speaks the same commands, so either is
 * accepted and the answer says which one replied.
 */
export async function composeRunner(refresh = false): Promise<ComposeRunner | null> {
  if (runnerCache !== undefined && !refresh) return runnerCache;
  for (const program of ['docker', 'podman']) {
    const version = await ask(program, ['compose', 'version']);
    if (version) {
      runnerCache = { program, version: version.split('\n')[0] ?? version };
      return runnerCache;
    }
  }
  runnerCache = null;
  return null;
}

export function clearComposeRunnerCache(): void {
  runnerCache = undefined;
}

/**
 * Read a compose file well enough to build an interface from it: the services,
 * what each one is (the comment above it counts as its description), the ports
 * it publishes, what it waits for, and whether it is meant to stay up.
 *
 * This is a reader, not a YAML implementation. It handles the shapes compose
 * files actually use and ignores what it does not recognise, because its
 * answers drive a page, and `docker compose config` remains the authority.
 */
function scanYaml(text: string): { services: ComposeService[]; lines: string[] } {
  const lines = text.split('\n');
  const services: ComposeService[] = [];
  let inServices = false;
  let current: ComposeService | null = null;
  let block: 'ports' | 'environment' | 'volumes' | 'depends_on' | 'profiles' | null = null;
  let comment: string[] = [];

  const blank = (name: string, about: string[]): ComposeService => ({
    name,
    about: about.length ? about.join(' ') : undefined,
    ports: [],
    dependsOn: [],
    healthcheck: false,
    envKeys: [],
    volumes: [],
    profiles: [],
  });

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim()) {
      comment = [];
      continue;
    }
    if (/^\s*#/.test(line)) {
      comment.push(line.replace(/^\s*#\s?/, '').trim());
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inServices = /^services\s*:/.test(line);
      if (current) services.push(current);
      current = null;
      block = null;
      comment = [];
      continue;
    }
    if (!inServices) {
      comment = [];
      continue;
    }
    if (indent === 2 && /^\s*[\w.-]+\s*:\s*$/.test(line)) {
      if (current) services.push(current);
      current = blank(line.trim().replace(/:$/, ''), comment);
      block = null;
      comment = [];
      continue;
    }
    comment = [];
    if (!current) continue;

    if (indent <= 4) {
      block = null;
      const key = /^\s*([\w.-]+)\s*:/.exec(line)?.[1];
      if (
        key === 'ports' ||
        key === 'environment' ||
        key === 'volumes' ||
        key === 'depends_on' ||
        key === 'profiles'
      )
        block = key;
      // A list can be written inline — `profiles: [api]` — as well as over
      // several lines, and a compose file may use either.
      const inline = /^\s*[\w.-]+\s*:\s*\[(.*)\]\s*$/.exec(line)?.[1];
      if (block && inline !== undefined) {
        const items = inline
          .split(',')
          .map((part) => part.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        if (block === 'profiles') current.profiles.push(...items);
        if (block === 'volumes') current.volumes.push(...items);
        if (block === 'depends_on') current.dependsOn.push(...items);
        block = null;
        continue;
      }
      if (key === 'image') current.image = line.split(':').slice(1).join(':').trim();
      if (key === 'restart')
        current.restart = line
          .split(':')
          .slice(1)
          .join(':')
          .trim()
          .replace(/^["']|["']$/g, '');
      if (key === 'healthcheck') current.healthcheck = true;
      if (block) continue;
    }

    const item = /^\s*-\s*(.*)$/.exec(line)?.[1]?.replace(/^["']|["']$/g, '');
    if (block === 'ports' && item) {
      // "5432:5432", "${POSTGRES_PORT:-5432}:5432", "127.0.0.1:8080:80", "3000"
      const parts = item.split(':');
      const container = Number(/(\d+)/.exec(parts[parts.length - 1] ?? '')?.[1] ?? 0) || undefined;
      const hostText = parts.length > 1 ? (parts[parts.length - 2] ?? '') : (parts[0] ?? '');
      const host = Number(/:-\s*(\d+)/.exec(hostText)?.[1] ?? /(\d+)/.exec(hostText)?.[1] ?? 0);
      if (host) current.ports.push({ host, container });
      continue;
    }
    if (block === 'volumes' && item) {
      current.volumes.push(item);
      continue;
    }
    if (block === 'profiles' && item) {
      current.profiles.push(item);
      continue;
    }
    if (block === 'depends_on') {
      // Both "- postgres" and the long form "postgres:\n  condition: ...".
      if (item) current.dependsOn.push(item);
      else {
        const key = /^\s*([\w.-]+)\s*:\s*$/.exec(line)?.[1];
        if (key && key !== 'condition') current.dependsOn.push(key);
      }
      continue;
    }
    if (block === 'environment') {
      const key = item ? item.split('=')[0] : /^\s*([\w.]+)\s*:/.exec(line)?.[1];
      if (key) current.envKeys.push(key.trim());
      continue;
    }
  }
  if (current) services.push(current);
  return { services, lines };
}

/**
 * Read a Crux's compose file and say whether it may run.
 *
 * Refusals are deliberately blunt: anything that reaches outside the Crux
 * folder or above the person's own privileges is a no, with the reason named
 * so they can change the file rather than guess.
 */
export function inspectCompose(folder: string, file?: string): ComposeReading {
  const files = file ? [file] : composeFiles(folder);
  const blank = { services: [], profiles: [], variables: [] };
  if (!files.length)
    return { ...blank, files: [], refusals: ['There is no compose.yaml in this Crux.'] };

  const set = envNames(folder);
  const merged = new Map<string, ComposeService>();
  const variables = new Map<string, ComposeVariable>();
  const refusals: string[] = [];

  // Base first, then the override on top — the order Compose merges them.
  for (const name of files) {
    const at = path.join(folder, name);
    if (!fs.existsSync(at)) continue;
    const text = fs.readFileSync(at, 'utf8');
    variablesIn(text, variables, set);
    const { services, lines } = scanYaml(text);
    for (const service of services) {
      const already = merged.get(service.name);
      // An override adds to a service rather than replacing it, so a later
      // file's ports and mounts are added to what the base already asked for.
      merged.set(
        service.name,
        already
          ? {
              ...already,
              ...service,
              about: service.about ?? already.about,
              image: service.image ?? already.image,
              restart: service.restart ?? already.restart,
              healthcheck: already.healthcheck || service.healthcheck,
              ports: [...already.ports, ...service.ports],
              dependsOn: [...new Set([...already.dependsOn, ...service.dependsOn])],
              envKeys: [...new Set([...already.envKeys, ...service.envKeys])],
              volumes: [...new Set([...already.volumes, ...service.volumes])],
              profiles: [...new Set([...already.profiles, ...service.profiles])],
            }
          : service,
      );
    }
    for (const reason of refusalsIn(lines))
      refusals.push(files.length > 1 ? `${name}: ${reason}` : reason);
  }

  const services = [...merged.values()];
  return {
    services,
    files,
    refusals: [...new Set(refusals)],
    profiles: [...new Set(services.flatMap((s) => s.profiles))].sort(),
    variables: [...variables.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Why a file must not be started. Deliberately blunt: anything that reaches
 * outside the Crux folder, or above the person's own privileges, is a no with
 * the reason named so they can change the file rather than guess.
 */
function refusalsIn(lines: string[]): string[] {
  const refusals: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#/.test(line)) continue;
    if (/^privileged\s*:\s*true/.test(line))
      refusals.push('A service asks for privileged mode, which is the whole machine.');
    if (/^(network_mode|pid|ipc|userns_mode)\s*:\s*(["']?)host\2/.test(line))
      refusals.push(`A service asks to share the host's ${line.split(':')[0]}.`);
    if (/docker\.sock/.test(line))
      refusals.push('A service mounts the Docker socket, which is root on this machine.');
    if (/^-\s*(["']?)(\/|~|\$\{?HOME)/.test(line) && /:/.test(line))
      refusals.push(`A service mounts a path outside the Crux: ${line.replace(/^-\s*/, '')}`);
    if (/^-\s*(["']?)\.\.\//.test(line))
      refusals.push(`A service mounts a path above the Crux: ${line.replace(/^-\s*/, '')}`);
    if (/^\s*build\s*:/.test(raw) && /\.\./.test(raw))
      refusals.push('A service builds from a directory above the Crux.');
  }
  return [...new Set(refusals)];
}

/**
 * The files Compose will actually read, base first.
 *
 * Compose merges an override file over the base without being told to, which
 * is exactly how a stack carries sensible defaults and a machine carries its
 * own changes — and exactly why every one of them must be checked. A refusal
 * that only reads the base would let an override mount the disk.
 */
export function composeFiles(folder: string): string[] {
  const bases = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
  const overrides = [
    'compose.override.yaml',
    'compose.override.yml',
    'docker-compose.override.yaml',
    'docker-compose.override.yml',
  ];
  const found: string[] = [];
  const base = bases.find((name) => fs.existsSync(path.join(folder, name)));
  if (base) found.push(base);
  const override = overrides.find((name) => fs.existsSync(path.join(folder, name)));
  if (override) found.push(override);
  return found;
}

/**
 * The names set in the Crux's `.env`, which Compose reads by itself. Only the
 * names: a value there is the person's business, and the bench says whether a
 * setting is set, never what it is.
 */
function envNames(folder: string): Set<string> {
  const at = path.join(folder, '.env');
  if (!fs.existsSync(at)) return new Set();
  const names = new Set<string>();
  try {
    for (const line of fs.readFileSync(at, 'utf8').split('\n')) {
      const name = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      if (name) names.add(name);
    }
  } catch {
    /* unreadable is the same as unset */
  }
  return names;
}

/** Every `${NAME}` and `${NAME:-default}` the files read. */
function variablesIn(text: string, into: Map<string, ComposeVariable>, set: Set<string>): void {
  for (const match of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}/g)) {
    const name = match[1]!;
    const existing = into.get(name);
    const fallback = match[2];
    if (existing) {
      if (existing.fallback === undefined && fallback !== undefined) existing.fallback = fallback;
      continue;
    }
    into.set(name, { name, fallback, fromEnv: set.has(name) });
  }
}

/** The project name a Crux's containers carry, so nothing else is ever touched. */
export function projectName(cruxId: string): string {
  return `crux-${cruxId
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24)
    .toLowerCase()}`;
}

export interface ComposeRunOptions {
  cruxId: string;
  folder: string;
  verb: ComposeVerb;
  /** Extra arguments, checked against a short list — never free-form. */
  service?: string;
  tail?: number;
  timeoutMs?: number;
  /** Compose profiles to include, for the optional parts of a stack. */
  profiles?: string[];
  /**
   * Settings handed to Compose as environment, for `${NAME}` the file reads.
   * The Crux's secrets arrive this way so a password never has to be written
   * into a file that gets published.
   */
  env?: Record<string, string>;
}

/**
 * Run one compose verb for a Crux. Output is streamed line by line through
 * `onLine`, because pulling images is slow and silence looks like a hang.
 */
export async function runCompose(
  opts: ComposeRunOptions,
  onLine: (line: string) => void,
): Promise<{ code: number; output: string }> {
  const runner = await composeRunner();
  if (!runner)
    throw new Error(
      'Docker is not on this machine. Install Docker Desktop (docker.com) or Podman, then look again.',
    );
  if (!COMPOSE_VERBS.includes(opts.verb)) throw new Error(`Not allowed: ${opts.verb}`);
  if (opts.service && !/^[\w.-]{1,64}$/.test(opts.service))
    throw new Error(`Not a service name: ${opts.service}`);
  for (const profile of opts.profiles ?? [])
    if (!/^[\w.-]{1,64}$/.test(profile)) throw new Error(`Not a profile name: ${profile}`);
  for (const name of Object.keys(opts.env ?? {}))
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Not a setting name: ${name}`);

  if (opts.verb === 'up' || opts.verb === 'start') {
    const reading = inspectCompose(opts.folder);
    if (reading.refusals.length)
      throw new Error(`This stack was not started.\n- ${reading.refusals.join('\n- ')}`);
  }

  return new Promise((resolve, reject) => {
    const args = ['compose', '--project-name', projectName(opts.cruxId)];
    for (const profile of opts.profiles ?? []) args.push('--profile', profile);
    if (opts.verb === 'up') args.push('up', '--detach', '--remove-orphans');
    else if (opts.verb === 'down') args.push('down', '--remove-orphans');
    else if (opts.verb === 'logs')
      args.push('logs', '--no-color', '--tail', String(Math.min(opts.tail ?? 200, 2000)));
    else if (opts.verb === 'ps') args.push('ps', '--format', 'json');
    else args.push(opts.verb);
    if (opts.service && opts.verb !== 'down') args.push(opts.service);

    const proc = spawn(runner.program, args, {
      cwd: opts.folder,
      env: {
        ...process.env,
        ...(opts.env ?? {}),
        COMPOSE_PROJECT_NAME: projectName(opts.cruxId),
      },
    });
    let output = '';
    const feed = (chunk: Buffer) => {
      const text = String(chunk);
      output += text;
      if (output.length > 400_000) output = output.slice(-200_000);
      for (const line of text.split('\n')) if (line.trim()) onLine(line.trim());
    };
    proc.stdout?.on('data', feed);
    proc.stderr?.on('data', feed);
    const timer = setTimeout(
      () => proc.kill('SIGTERM'),
      Math.min(opts.timeoutMs ?? 10 * 60_000, 30 * 60_000),
    );
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
