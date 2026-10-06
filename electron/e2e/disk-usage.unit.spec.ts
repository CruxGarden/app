import { test, expect } from '@playwright/test';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  DiskUsageMeter,
  cacheSize,
  clearCaches,
  measureDiskUsage,
  treeSize,
  walkBudget,
  type CacheSession,
} from '../src/disk-usage';
import type { DiskUsageSummary } from '../src/bridge';

/** Local disk-use summary and cache clearing (ADR 0085), on plain temp folders. */
const FP = (char: string) => char.repeat(64);

function write(file: string, bytes: number) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, Buffer.alloc(bytes, 1));
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'crux-disk-unit-'));
  const garden = join(base, 'garden');
  const userData = join(base, 'userData');
  // Project Folders, one with a hard-linked recovery point and a unique one.
  write(join(garden, 'blog', 'index.html'), 1000);
  write(join(garden, 'blog', 'src', 'a.md'), 200);
  mkdirSync(join(garden, 'blog', '.crux-recovery', 'edit', 'x'), { recursive: true });
  linkSync(
    join(garden, 'blog', 'index.html'),
    join(garden, 'blog', '.crux-recovery', 'edit', 'x', 'index.html'),
  );
  write(join(garden, 'blog', '.crux-recovery', 'edit', 'x', 'gone.md'), 30);
  write(join(garden, 'notes', 'n.md'), 50);
  // An installed Crux Tool's folder, the Runtime Store, loose garden files.
  write(join(garden, 'p5-tool', 'tool.zip'), 400);
  write(join(garden, 'runtimes', 'p5', 'v1', 'index.js'), 70);
  write(join(garden, 'memory.md'), 5);
  // Profile: database, blobs (one is a tool package), native tools, caches, the rest.
  write(join(userData, 'cruxgarden.db'), 4000);
  write(join(userData, 'cruxgarden.db-wal'), 100);
  write(join(userData, 'blobs', FP('a')), 300);
  write(join(userData, 'blobs', FP('b')), 600);
  write(join(userData, 'tools', 'darwin-arm64', 'typst'), 900);
  write(join(userData, 'Cache', 'Cache_Data', 'f_1'), 2000);
  write(join(userData, 'Code Cache', 'js', 'x'), 500);
  write(join(userData, 'Partitions', 'crux-www', 'GPUCache', 'data_1'), 80);
  write(join(userData, 'Local Storage', 'leveldb', '000.log'), 60);
  write(join(userData, 'desktop-config.json'), 10);
  return { base, garden, userData };
}

const layout = (f: ReturnType<typeof fixture>) => ({
  gardenRoot: f.garden,
  userData: f.userData,
  projectFolders: [join(f.garden, 'blog'), join(f.garden, 'notes'), join(f.garden, 'p5-tool')],
  toolFolders: [join(f.garden, 'p5-tool')],
  toolBlobs: [FP('b'), 'not-a-fingerprint'],
  blobDir: join(f.userData, 'blobs'),
});

function snapshot(root: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[relative(root, full)] = statSync(full).size;
    }
  };
  walk(root);
  return out;
}

test('categories are summed without overlap and total adds up', async () => {
  const f = fixture();
  try {
    const usage = await measureDiskUsage(layout(f), walkBudget(), () => new Date(0));
    expect(usage).toMatchObject({
      projectFoldersBytes: 1000 + 200 + 50,
      historyBytes: 4000 + 100 + 30, // the hard-linked recovery copy is not counted twice
      toolInstallsBytes: 400 + 70 + 900 + 600,
      blobStoreBytes: 300,
      cacheBytes: 2000 + 500 + 80,
      otherBytes: 5 + 60 + 10,
      complete: true,
      measuredAt: '1970-01-01T00:00:00.000Z',
    });
    const parts =
      usage.projectFoldersBytes +
      usage.blobStoreBytes +
      usage.historyBytes +
      usage.toolInstallsBytes +
      usage.otherBytes;
    expect(usage.gardenBytes).toBe(parts);
    expect(usage.totalBytes).toBe(parts + usage.cacheBytes);
    expect(usage.roots.garden.endsWith('garden')).toBe(true);
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('symlinks are never followed and unreadable folders are skipped', async () => {
  const f = fixture();
  try {
    const outside = join(f.base, 'outside');
    write(join(outside, 'huge.bin'), 50_000);
    symlinkSync(outside, join(f.garden, 'blog', 'linked-dir'));
    symlinkSync(join(outside, 'huge.bin'), join(f.garden, 'blog', 'linked-file'));
    const locked = join(f.garden, 'notes', 'locked');
    write(join(locked, 'secret.md'), 7000);
    chmodSync(locked, 0o000);
    try {
      const usage = await measureDiskUsage(layout(f));
      expect(usage.projectFoldersBytes).toBe(1000 + 200 + 50);
      // A symlinked root is resolved to its target; a link inside a root is not.
      expect(await treeSize(join(f.garden, 'blog', 'linked-file'), walkBudget())).toBe(0);
    } finally {
      chmodSync(locked, 0o755);
    }
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('a walk that exceeds its budget stops and says the numbers are incomplete', async () => {
  const f = fixture();
  try {
    const usage = await measureDiskUsage(layout(f), walkBudget(15_000, 3));
    expect(usage.complete).toBe(false);
    const late = await measureDiskUsage(layout(f), walkBudget(-1));
    expect(late.complete).toBe(false);
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('clearing caches goes through the sessions only and leaves everything else alone', async () => {
  const f = fixture();
  try {
    const protectedBefore = {
      garden: snapshot(f.garden),
      blobs: snapshot(join(f.userData, 'blobs')),
      tools: snapshot(join(f.userData, 'tools')),
      storage: snapshot(join(f.userData, 'Local Storage')),
    };
    const calls: string[] = [];
    // Chromium empties its own cache directories when asked.
    const session: CacheSession = {
      clearCache: async () => {
        calls.push('cache');
        rmSync(join(f.userData, 'Cache'), { recursive: true });
      },
      clearCodeCaches: async (options) => {
        calls.push(`code:${JSON.stringify(options)}`);
        rmSync(join(f.userData, 'Code Cache'), { recursive: true });
      },
      clearStorageData: async (options) => {
        calls.push(`storage:${options.storages.join(',')}`);
      },
    };
    expect(await cacheSize(f.userData)).toBe(2580);
    const result = await clearCaches(f.userData, [session, session]);
    expect(result).toEqual({ freedBytes: 2500 });
    expect(calls).toEqual(['cache', 'code:{}', 'storage:shadercache']);
    expect({
      garden: snapshot(f.garden),
      blobs: snapshot(join(f.userData, 'blobs')),
      tools: snapshot(join(f.userData, 'tools')),
      storage: snapshot(join(f.userData, 'Local Storage')),
    }).toEqual(protectedBefore);
    expect(existsSync(join(f.userData, 'cruxgarden.db'))).toBe(true);
    expect(existsSync(join(f.userData, 'desktop-config.json'))).toBe(true);
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('a failing session does not stop the others', async () => {
  const f = fixture();
  try {
    const broken: CacheSession = {
      clearCache: async () => {
        throw new Error('gone');
      },
      clearCodeCaches: async () => {
        throw new Error('gone');
      },
      clearStorageData: async () => {
        throw new Error('gone');
      },
    };
    const working: CacheSession = {
      clearCache: async () => rmSync(join(f.userData, 'Cache'), { recursive: true }),
      clearCodeCaches: async () => {},
      clearStorageData: async () => {},
    };
    expect(await clearCaches(f.userData, [broken, working])).toEqual({ freedBytes: 2000 });
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the meter reuses a measurement for a minute and shares one in flight', async () => {
  let now = 0;
  let runs = 0;
  const value = { totalBytes: 1 } as DiskUsageSummary;
  const meter = new DiskUsageMeter(
    async () => {
      runs++;
      return value;
    },
    60_000,
    () => now,
  );
  await Promise.all([meter.read(), meter.read()]);
  expect(runs).toBe(1);
  now = 59_000;
  await meter.read();
  expect(runs).toBe(1);
  await meter.read(true);
  expect(runs).toBe(2);
  now = 200_000;
  await meter.read();
  expect(runs).toBe(3);
  meter.invalidate();
  await meter.read();
  expect(runs).toBe(4);
});
