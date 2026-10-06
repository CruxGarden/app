/** Control existing project containers without rereading editable source files.
 * The engine's project labels supply identities; they never supply command flags.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeName, composeProcess, composeProcessEnvironment, mapping } from './compose-project';

interface ContainerIdentity {
  service: string;
  hash: string;
  oneOff: boolean;
}

function jsonRows(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const values: unknown[] = trimmed.startsWith('[')
    ? JSON.parse(trimmed)
    : trimmed.split('\n').map((line) => JSON.parse(line));
  if (values.length > 1000) throw new Error('Too many resources in this Compose project.');
  return values.map((value) => mapping(value, 'Engine resource'));
}

function labels(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return mapping(value, 'Engine labels');
  return Object.fromEntries(
    value.split(',').map((part) => {
      const equals = part.indexOf('=');
      return [part.slice(0, equals), part.slice(equals + 1)];
    }),
  );
}

export async function prepareComposeControl(
  program: string,
  project: string,
  includeNetworks = false,
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crux-compose-control-'));
  const dispose = () => fs.rmSync(directory, { recursive: true, force: true });
  const env = composeProcessEnvironment();
  const config = path.join(directory, 'control.json');
  const emptyEnv = path.join(directory, 'empty.env');
  fs.writeFileSync(emptyEnv, '', { mode: 0o600 });
  fs.writeFileSync(config, '{"services":{}}', { mode: 0o600 });
  const args = [
    'compose',
    '--project-directory',
    directory,
    '--project-name',
    project,
    '--env-file',
    emptyEnv,
    '-f',
    config,
  ];
  const query = async (command: string[]) => {
    const answer = await composeProcess(program, command, { cwd: directory, env });
    if (answer.code)
      throw new Error(`Could not inspect this Compose project: ${answer.stderr.slice(-600)}`);
    return answer.stdout;
  };
  try {
    const rows = jsonRows(await query([...args, 'ps', '--all', '--format', 'json']));
    const containers: ContainerIdentity[] = [];
    const services: Record<string, unknown> = Object.create(null);
    for (const row of rows) {
      const tags = labels(row.Labels);
      if (tags['com.docker.compose.project'] !== project)
        throw new Error('The container engine returned a different project.');
      const service = composeName(row.Service, 'service name');
      if (tags['com.docker.compose.service'] !== service)
        throw new Error('The container engine returned inconsistent service labels.');
      containers.push({
        service,
        hash: String(tags['com.docker.compose.config-hash'] ?? ''),
        oneOff: String(tags['com.docker.compose.oneoff']).toLowerCase() === 'true',
      });
      services[service] = { image: 'scratch' };
    }
    const networks: Record<string, unknown> = Object.create(null);
    if (includeNetworks) {
      const rows = jsonRows(
        await query([
          'network',
          'ls',
          '--filter',
          `label=com.docker.compose.project=${project}`,
          '--format',
          '{{json .}}',
        ]),
      );
      for (const row of rows) {
        const name = String(row.Name ?? '');
        if (!name.startsWith(`${project}_`))
          throw new Error('This project has a network outside its namespace.');
        const key = composeName(name.slice(project.length + 1), 'network name');
        // The filtered engine query and namespace must both match. No external
        // network or arbitrary engine name can enter the control document.
        networks[key] = { name };
      }
    }
    fs.writeFileSync(config, JSON.stringify({ services, networks }), { mode: 0o600 });
    return { model: { services }, containers, args, directory, env, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Reusing a container must mean reusing the admitted configuration. Up can
 * converge changed configuration; start and exec cannot safely assume it did.
 */
export async function verifyExistingCompose(
  program: string,
  projectName: string,
  prepared: { args: string[]; directory: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  const control = await prepareComposeControl(program, projectName);
  try {
    if (!control.containers.length) return;
    const answer = await composeProcess(
      program,
      [...prepared.args, '--profile', '*', 'config', '--hash', '*'],
      { cwd: prepared.directory, env: prepared.env },
    );
    if (answer.code)
      throw new Error('This Compose provider cannot verify existing container configuration.');
    const hashes = new Map(
      answer.stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [service, hash] = line.trim().split(/\s+/);
          return [service, hash];
        }),
    );
    // A one-off run has a different command/hash and is never reused by these
    // operations. Only the regular service containers can become dependencies
    // or the targets of start/exec.
    for (const container of control.containers)
      if (
        !container.oneOff &&
        (!container.hash || hashes.get(container.service) !== container.hash)
      )
        throw new Error(
          `Service ${container.service} has a different configuration. Start the stack with Up to apply the current configuration first.`,
        );
  } finally {
    control.dispose();
  }
}

/** A service hash does not include the definitions of its named resources.
 * Up also reuses named volumes, so inspect those independently before any
 * operation can create or reuse a container. Never remove incompatible data.
 */
export async function verifyComposeResources(
  program: string,
  project: string,
  prepared: { model: Record<string, unknown>; directory: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  const query = async (args: string[]) => {
    const answer = await composeProcess(program, args, {
      cwd: prepared.directory,
      env: prepared.env,
    });
    if (answer.code)
      throw new Error(`Could not verify existing project resources: ${answer.stderr.slice(-600)}`);
    return jsonRows(answer.stdout);
  };
  for (const [kind, plural] of [
    ['volume', 'volumes'],
    ['network', 'networks'],
  ] as const) {
    const definitions = mapping(prepared.model[plural] ?? {}, plural);
    if (!Object.keys(definitions).length) continue;
    // Include matching names even without project labels: a pre-existing host
    // resource cannot become trusted just by occupying the expected name.
    const listed = await query([
      kind,
      'ls',
      '--filter',
      `name=${project}_`,
      '--format',
      '{{json .}}',
    ]);
    const names = new Set(listed.map((row) => row.Name));
    for (const [key, raw] of Object.entries(definitions)) {
      const name = `${project}_${key}`;
      if (!names.has(name)) continue;
      const definition = mapping(raw ?? {}, `${plural}.${key}`);
      const [resource] = await query([kind, 'inspect', name, '--format', '{{json .}}']);
      if (!resource) throw new Error(`Missing metadata for ${kind} ${key}.`);
      const tags = labels(resource.Labels);
      const options = mapping(resource.Options ?? {}, 'Resource options');
      const owned =
        tags['com.docker.compose.project'] === project &&
        tags[`com.docker.compose.${kind}`] === key;
      // Compose 5 writes its default IP-family settings as bridge options.
      // Older providers omit them. Admit only those exact defaults.
      const defaults: Record<string, string> =
        kind === 'network'
          ? {
              'com.docker.network.enable_ipv4': 'true',
              'com.docker.network.enable_ipv6': 'false',
            }
          : {};
      const standard =
        resource.Driver === (kind === 'volume' ? 'local' : 'bridge') &&
        Object.entries(options).every(
          ([key, value]) => Object.hasOwn(defaults, key) && value === defaults[key],
        );
      const networkMatches =
        kind !== 'network' ||
        (resource.EnableIPv4 !== false &&
          !resource.EnableIPv6 &&
          Boolean(resource.Internal) === Boolean(definition.internal) &&
          Boolean(resource.Attachable) === Boolean(definition.attachable) &&
          ['default', ''].includes(String(mapping(resource.IPAM, 'Network IPAM').Driver ?? '')) &&
          Object.keys(mapping(mapping(resource.IPAM, 'Network IPAM').Options ?? {}, 'IPAM options'))
            .length === 0);
      if (!owned || !standard || !networkMatches)
        throw new Error(
          `Existing ${kind} ${key} does not match the admitted project policy. Stop and review this resource before restarting; its data has not been removed.`,
        );
    }
  }
}
