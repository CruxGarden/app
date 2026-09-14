import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteCruxService } from './sqlite/crux.service';
import { ensureInstalled } from './site';

/**
 * The install a preview waits on (ADR 0004/0005): two callers arriving while
 * pnpm runs share one install instead of racing it — the second start used to
 * see node_modules/ appear and spawn `astro dev` into a half-linked folder
 * ("Command astro not found", exit 254).
 */
function fakeBridges() {
  const folders = new Set<string>();
  let installs = 0;
  let installed = false;
  let release: (() => void) | null = null;
  const project = {
    createFolder: async (slug: string) => {
      const folder = `/garden/${slug}`;
      folders.add(folder);
      return folder;
    },
    ensureFolder: async (folder: string) => {
      folders.add(folder);
      return folder;
    },
    folderExists: async (folder: string) => folders.has(folder),
    writeFile: async () => {},
    readFile: async () => {
      throw new Error('not found');
    },
    deleteFile: async () => {},
    renameFile: async () => {},
    reveal: async () => {},
    listFiles: async () => [],
  };
  const toolchain = {
    hasPackageJson: async () => true,
    isInstalled: async () => installed,
    install: () =>
      new Promise<{ code: number; log: string }>((resolve) => {
        installs++;
        release = () => {
          installed = true;
          resolve({ code: 0, log: 'Done' });
        };
      }),
    build: async () => ({ code: 0, log: '', distFiles: [] }),
  };
  return {
    api: { project, toolchain, devserver: {} },
    installs: () => installs,
    finish: () => release?.(),
  };
}

describe('ensureInstalled', () => {
  let bridges: ReturnType<typeof fakeBridges>;
  beforeEach(() => {
    bridges = fakeBridges();
    (globalThis as Record<string, unknown>).window = { electronAPI: bridges.api };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('runs one install for concurrent callers and none once installed', async () => {
    const crux = await new SqliteCruxService().create({ title: 'Garden', type: 'workspace' });
    const first = ensureInstalled(crux.id);
    const second = ensureInstalled(crux.id);
    await new Promise((r) => setTimeout(r, 10));
    expect(bridges.installs()).toBe(1);
    bridges.finish();
    await Promise.all([first, second]);
    await ensureInstalled(crux.id);
    expect(bridges.installs()).toBe(1);
  });
});
