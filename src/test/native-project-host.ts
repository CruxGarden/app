import { build } from 'esbuild';
import { createRequire, isBuiltin } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as ProjectHost from '../../electron/src/projects';
import type { ProjectBridge } from '@/lib/platform';

const electronRequire = createRequire(new URL('../../electron/package.json', import.meta.url));
let compiled: Promise<string> | undefined;

/** Load the current production host source in Node, including its CommonJS
 * dependencies. This is isolated test setup, never a stale electron/dist copy. */
export async function nativeProjectHost(dir: string, blobDir: string) {
  compiled ??= build({
    entryPoints: [fileURLToPath(new URL('../../electron/src/projects.ts', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [
      {
        name: 'native-test-packages',
        setup(builder) {
          builder.onResolve({ filter: /^[^./]/ }, ({ path }) => ({
            path: isBuiltin(path) ? path : electronRequire.resolve(path),
            external: true,
          }));
        },
      },
    ],
  }).then((result) => result.outputFiles[0]!.text);
  const path = join(dir, 'project-host.cjs');
  await writeFile(path, await compiled);
  const { DesktopConfig, ProjectFolders } = electronRequire(path) as typeof ProjectHost;
  const projects = new ProjectFolders(new DesktopConfig(dir, join(dir, 'projects')));
  // The host performs every filesystem operation. Only watcher delivery and OS
  // reveal are omitted; tests trigger scans explicitly against these real files.
  const bridge = {
    createFolder: async (slug: string) => projects.createFolder(slug),
    ensureFolder: async (folder: string) => projects.ensureFolder(folder),
    folderExists: async (folder: string) => projects.folderExists(folder),
    writeFile: async (...args) => projects.writeFile(...args),
    readFile: async (...args) => projects.readFile(...args),
    deleteFile: async (...args) => projects.deleteFile(...args),
    renameFile: async (...args) => projects.renameFile(...args),
    listFiles: async (folder) => projects.listFiles(folder),
    ignoredPaths: async (...args) => projects.ignoredPaths(...args),
    capture: async (folder) => projects.capture(folder),
    captureManifest: async (folder, indexed) => projects.captureManifest(folder, blobDir, indexed),
    materialize: async (folder, entries) => projects.materialize(folder, blobDir, entries),
    setMode: async (...args) => projects.setMode(...args),
    reconcile: async (...args) => projects.reconcile(...args),
    watch: async () => {},
    unwatch: async () => {},
    flush: async () => [],
    onChanged: () => () => {},
    reveal: async () => {},
  } satisfies ProjectBridge;
  return { projects, bridge };
}
