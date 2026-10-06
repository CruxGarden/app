/** Read, resolve and freeze one admitted Compose project before executing it.
 * Project variables are namespaced interpolation data, never runner settings.
 * Docker owns merge/interpolation semantics; this module owns host access.
 */
import { boundedProcess, ProcessOutputLimitError } from './bounded-process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isDeepStrictEqual, parseEnv } from 'node:util';
import { isMap, isScalar, isSeq, parseDocument, visit } from 'yaml';
import { isInside, resolveInsideOrThrow } from './paths';

type Mapping = Record<string, unknown>;
export type ComposeModel = Mapping & { services: Record<string, Mapping> };
export const LOCAL_ENV = '.crux/local.env';
export const LOCAL_COMPOSE = '.crux/local.compose.yaml';
const LIMIT = 1024 * 1024;
const INPUT = 'CRUX_COMPOSE_INPUT_';
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const bases = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const overrides = [
  'compose.override.yaml',
  'compose.override.yml',
  'docker-compose.override.yaml',
  'docker-compose.override.yml',
];

export function mapping(value: unknown, label: string): Mapping {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be a mapping.`);
  return value as Mapping;
}

export function composeName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !NAME.test(value))
    throw new Error(`Not a ${label}: ${String(value)}`);
  return value;
}

/** Reject links even when their target does not exist yet. */
export function composePath(folder: string, name: string): string {
  const target = resolveInsideOrThrow(folder, name);
  let current = path.resolve(folder);
  for (const part of path.relative(current, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error('Compose paths must not use symbolic links.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

function containedFile(folder: string, name: string): string {
  const at = composePath(folder, name);
  const stat = fs.statSync(at);
  if (!stat.isFile() || stat.size > LIMIT || stat.nlink > 1)
    throw new Error(`${name} must be an ordinary file of at most 1 MiB, without hard links.`);
  return at;
}

export function readComposeFile(folder: string, name: string): string {
  return fs.readFileSync(containedFile(folder, name), 'utf8');
}

/** Replace an owned configuration file without truncating an existing inode. */
export function writeComposeFile(folder: string, name: string, text: string): void {
  if (Buffer.byteLength(text) > LIMIT) throw new Error('Compose configuration exceeds 1 MiB.');
  const target = composePath(folder, name);
  if (fs.existsSync(target)) containedFile(folder, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.compose-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
    // Recheck the parent after creating the temporary file. This is not a
    // guarantee against another host process racing filesystem replacements.
    composePath(folder, name);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function composeFiles(folder: string, includeLocal = false): string[] {
  const found = [bases, overrides].flatMap((names) => {
    const name = names.find((entry) => fs.existsSync(path.join(folder, entry)));
    return name ? [name] : [];
  });
  if (includeLocal && fs.existsSync(path.join(folder, LOCAL_COMPOSE))) found.push(LOCAL_COMPOSE);
  return found;
}

function boundedTree(value: unknown): void {
  let count = 0;
  const ancestors = new Set<object>();
  function walk(node: unknown, depth: number) {
    if (++count > 30_000 || depth > 40) throw new Error('Compose configuration is too complex.');
    if (!node || typeof node !== 'object') return;
    if (ancestors.has(node)) throw new Error('Compose aliases must not form a cycle.');
    ancestors.add(node);
    for (const [key, child] of Object.entries(node)) {
      // Compose 5 doubles dollars in map keys on every canonical reload. Such
      // keys cannot be frozen with the same meaning by this provider contract.
      if (key.includes('$'))
        throw new Error('Dollar signs in Compose mapping keys are not supported.');
      walk(child, depth + 1);
    }
    ancestors.delete(node);
  }
  walk(value, 0);
}

/** Preserve Compose's $$ escape and nested defaults while moving each reference. */
function scopedReferences(value: string): string {
  return value.replace(
    /\$\$|\$(\{?)([A-Za-z_][A-Za-z0-9_]*)/g,
    (whole, brace: string, name: string) => (whole === '$$' ? whole : `$${brace}${INPUT}${name}`),
  );
}

export function parseCompose(text: string) {
  if (Buffer.byteLength(text) > LIMIT) throw new Error('Compose file exceeds 1 MiB.');
  const document = parseDocument(text, {
    merge: true,
    customTags: [{ tag: '!override', collection: 'seq', resolve: (value) => value }],
  });
  if (document.errors.length || document.warnings.length)
    throw new Error(
      `Invalid Compose YAML: ${(document.errors[0] ?? document.warnings[0])!.message}`,
    );
  const model = mapping(document.toJS({ maxAliasCount: 30 }) ?? {}, 'Compose configuration');
  boundedTree(model);
  const comments: Record<string, string> = Object.create(null);
  const portOverrides = new Set<string>();
  const services = document.get('services', true);
  if (isMap(services))
    for (const item of services.items) {
      const name = isScalar(item.key) ? String(item.key.value) : '';
      const comment =
        (isScalar(item.key) ? item.key.commentBefore : null) ??
        (item.value && typeof item.value === 'object' && 'commentBefore' in item.value
          ? item.value.commentBefore
          : null) ??
        (services.items[0] === item ? services.commentBefore : null);
      const ports = document.getIn(['services', name, 'ports'], true);
      if (isSeq(ports) && ports.tag === '!override') portOverrides.add(name);
      if (comment)
        comments[name] = String(comment)
          .trim()
          .split('\n')
          .map((line) => line.trim())
          .join(' ');
    }
  visit(document, {
    Scalar(key, node) {
      // Compose interpolates values, not mapping keys (including env names).
      if (key !== 'key' && typeof node.value === 'string')
        node.value = scopedReferences(node.value);
    },
  });
  return { model, comments, portOverrides, scopedYaml: document.toString() };
}

const serviceFields = new Set([
  'image',
  'command',
  'entrypoint',
  'environment',
  'ports',
  'expose',
  'volumes',
  'depends_on',
  'healthcheck',
  'profiles',
  'restart',
  'working_dir',
  'user',
  'hostname',
  'init',
  'read_only',
  'tmpfs',
  'mem_limit',
  'mem_reservation',
  'cpus',
  'pids_limit',
  'stop_signal',
  'stop_grace_period',
  'stdin_open',
  'tty',
  'platform',
  'networks',
  'extra_hosts',
  'dns',
  'dns_search',
  'cap_drop',
  'privileged',
]);

function fields(value: Mapping, allowed: Set<string>, label: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) && !key.startsWith('x-'))
      throw new Error(`${label}: ${key} is not supported by the confined Stack runner.`);
  }
}

function bindPath(folder: string, source: string, resolved: boolean): void {
  if (!resolved && source.includes('$')) return; // Check the actual result before execution.
  if (/docker\.sock|podman\.sock/i.test(source))
    throw new Error('A service mounts a container socket.');
  if (source.startsWith('~') || source.startsWith('..'))
    throw new Error('A service mounts a path above the Crux or outside the Crux.');
  const target = path.isAbsolute(source) ? source : resolveInsideOrThrow(folder, source);
  if (!isInside(folder, target)) throw new Error('A service mounts a path outside the Crux.');
  composePath(folder, path.relative(path.resolve(folder), path.resolve(target)) || '.');
  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if ((!stat.isFile() && !stat.isDirectory()) || (stat.isFile() && stat.nlink > 1))
      throw new Error('Bind mounts must be ordinary Project Folder files or directories.');
  }
}

/** Both the source shape and Docker's resolved shape must satisfy this policy. */
export function validateCompose(
  model: Mapping,
  folder: string,
  project?: string,
): asserts model is ComposeModel {
  const resolved = project !== undefined;
  fields(model, new Set(['services', 'volumes', 'networks', 'name', 'version']), 'Compose');
  const services = mapping(model.services ?? {}, 'services');
  if ((resolved && !Object.keys(services).length) || Object.keys(services).length > 100)
    throw new Error('Choose between 1 and 100 Compose services.');
  for (const [name, entry] of Object.entries(services)) {
    composeName(name, 'service name');
    const service = mapping(entry, name);
    fields(service, serviceFields, name);
    if (service.privileged !== undefined && service.privileged !== false)
      throw new Error(`${name}: privileged mode is refused.`);
    if (resolved && (typeof service.image !== 'string' || !service.image))
      throw new Error(`${name}: choose a container image; local builds are not supported.`);
    if (service.environment !== undefined) {
      const env = service.environment;
      if (Array.isArray(env)) {
        for (const item of env)
          if (typeof item !== 'string' || !item.includes('='))
            throw new Error(
              `${name}: environment entries need explicit values; host inheritance is refused.`,
            );
      } else {
        for (const value of Object.values(mapping(env, `${name}.environment`)))
          if (value === null || value === undefined)
            throw new Error(
              `${name}: environment entries need explicit values; host inheritance is refused.`,
            );
      }
    }
    if (service.volumes !== undefined) {
      if (!Array.isArray(service.volumes)) throw new Error(`${name}.volumes must be a list.`);
      for (const volume of service.volumes) {
        if (typeof volume === 'string' && !resolved) {
          const parts = volume.split(':');
          if (parts.length > 1 && (/^[./~\\]/.test(parts[0]!) || parts[0]!.includes('$')))
            bindPath(folder, parts[0]!, false);
          continue;
        }
        const mount = mapping(volume, `${name}.volumes`);
        fields(
          mount,
          new Set([
            'type',
            'source',
            'target',
            'read_only',
            'bind',
            'volume',
            'tmpfs',
            'consistency',
          ]),
          'Mount',
        );
        if (mount.type === 'bind') {
          if (typeof mount.source !== 'string') throw new Error('Bind mounts need a source.');
          bindPath(folder, mount.source, resolved);
          if (mount.bind)
            fields(mapping(mount.bind, 'bind'), new Set(['create_host_path']), 'Bind mount');
        } else if (mount.type !== 'volume' && mount.type !== 'tmpfs') {
          throw new Error('Only contained bind mounts, project volumes and tmpfs are supported.');
        }
      }
    }
  }
  for (const kind of ['volumes', 'networks']) {
    if (model[kind] === undefined) continue;
    for (const [name, value] of Object.entries(mapping(model[kind], kind))) {
      composeName(name, `${kind} name`);
      const definition = value === null ? {} : mapping(value, `${kind}.${name}`);
      fields(
        definition,
        new Set(['name', 'driver', 'external', 'internal', 'attachable', 'ipam']),
        kind,
      );
      if (definition.ipam !== undefined && Object.keys(mapping(definition.ipam, 'ipam')).length)
        throw new Error('Custom network address management is not supported.');
      if (definition.external) throw new Error(`External ${kind} are not allowed.`);
      if (definition.name !== undefined && (!resolved || definition.name !== `${project}_${name}`))
        throw new Error(`${kind} names belong to this Crux's Compose project.`);
      if (
        definition.driver !== undefined &&
        definition.driver !== (kind === 'volumes' ? 'local' : 'bridge')
      )
        throw new Error(`Only the default ${kind} driver is supported.`);
    }
  }
}

/** Literal per-project settings. Interpolation/defaults belong in compose.yaml. */
export function composeVariables(
  folder: string,
  supplied: Record<string, string> = {},
): Record<string, string> {
  const variables: Record<string, string> = Object.create(null);
  for (const file of ['.env', LOCAL_ENV]) {
    if (fs.existsSync(path.join(folder, file)))
      Object.assign(variables, parseEnv(readComposeFile(folder, file)));
  }
  Object.assign(variables, supplied);
  if (Object.keys(variables).length > 1000) throw new Error('Too many Compose variables.');
  for (const [name, value] of Object.entries(variables))
    if (
      !VARIABLE.test(name) ||
      typeof value !== 'string' ||
      value.includes('\0') ||
      Buffer.byteLength(value) > 64_000
    )
      throw new Error(`Invalid Compose variable: ${name}`);
  if (Buffer.byteLength(JSON.stringify(variables)) > LIMIT)
    throw new Error('Compose variables exceed 1 MiB.');
  return variables;
}

/** Preserve the person's container connection, without inheriting app secrets. */
export function composeProcessEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'USERPROFILE',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
    'TMPDIR',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
    'DOCKER_CERT_PATH',
    'DOCKER_TLS_VERIFY',
    'CONTAINER_HOST',
    'CONTAINER_CONNECTION',
    'XDG_RUNTIME_DIR',
  ]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.COMPOSE_DISABLE_ENV_FILE = '1';
  env.COMPOSE_ANSI = 'never';
  return env;
}

export function composeProcess(
  program: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onLine?: (line: string) => void;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return boundedProcess(program, args, {
    ...options,
    timeoutMs: options.timeoutMs ?? 30_000,
    onData: (text) => {
      for (const line of text.split('\n'))
        if (line.trim()) options.onLine?.(line.trim().slice(0, 4000));
    },
  })
    .then(({ code, stdout, stderr, timedOut }) => {
      if (timedOut) throw new Error('Compose exceeded its time/output limits.');
      return { code, stdout, stderr };
    })
    .catch((error: unknown) => {
      if (error instanceof ProcessOutputLimitError)
        throw new Error('Compose exceeded its time/output limits.', { cause: error });
      throw error;
    });
}

export async function prepareComposeProject(
  program: string,
  folder: string,
  project: string,
  profiles: string[] = [],
  supplied: Record<string, string> = {},
) {
  const selected = composeFiles(folder, true);
  if (!selected.length) throw new Error('There is no compose.yaml in this Crux.');
  if (!Array.isArray(profiles) || profiles.length > 100)
    throw new Error('Choose at most 100 Compose profiles.');
  for (const profile of profiles) composeName(profile, 'profile name');
  const documents = selected.map((name) => parseCompose(readComposeFile(folder, name)));
  for (const document of documents) validateCompose(document.model, folder);
  const variables = composeVariables(folder, supplied);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crux-compose-prepared-'));
  const dispose = () => fs.rmSync(directory, { recursive: true, force: true });
  try {
    const env = composeProcessEnvironment();
    for (const [name, value] of Object.entries(variables)) env[INPUT + name] = value;
    const emptyEnv = path.join(directory, 'empty.env');
    fs.writeFileSync(emptyEnv, '', { mode: 0o600 });
    const common = [
      'compose',
      '--project-directory',
      folder,
      '--project-name',
      project,
      '--env-file',
      emptyEnv,
    ];
    for (const profile of profiles) common.push('--profile', profile);
    const sources: string[] = [];
    documents.forEach((document, index) => {
      const file = path.join(directory, `${index}.yaml`);
      fs.writeFileSync(file, document.scopedYaml, { mode: 0o600 });
      sources.push('-f', file);
    });
    const answer = await composeProcess(
      program,
      [...common, ...sources, '--profile', '*', 'config', '--format', 'json'],
      { cwd: directory, env },
    );
    if (answer.code)
      throw new Error(`Compose refused the configuration: ${answer.stderr.slice(-600)}`);
    const decode = (text: string) =>
      mapping(
        JSON.parse(text, (_key, value: unknown) =>
          typeof value === 'string' ? value.replaceAll('$$', '$') : value,
        ),
        'Resolved Compose',
      );
    const model = decode(answer.stdout);
    boundedTree(model);
    validateCompose(model, folder, project);
    const snapshot = path.join(directory, 'resolved.json');
    // Compose's canonical serializer escapes literal dollars for reloading.
    // Preserve those exact bytes; validate decoded values, especially bind paths.
    fs.writeFileSync(snapshot, answer.stdout, { mode: 0o600 });
    const reloaded = await composeProcess(
      program,
      [...common, '-f', snapshot, '--profile', '*', 'config', '--format', 'json'],
      { cwd: directory, env: composeProcessEnvironment() },
    );
    if (reloaded.code || !isDeepStrictEqual(decode(reloaded.stdout), model))
      throw new Error('This Compose provider cannot reload the validated configuration unchanged.');
    return {
      model,
      args: [...common, '-f', snapshot],
      directory,
      env: composeProcessEnvironment(),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
