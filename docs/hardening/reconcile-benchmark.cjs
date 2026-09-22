// Native startup scan only; recent local files (warm cache), not full UI startup.
// Run after `cd electron && npm run build`: node docs/hardening/reconcile-benchmark.cjs
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir, cpus } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { DesktopConfig, ProjectFolders } = require('../../electron/dist/projects');
const reports = [];
for (const count of [1000, 10000, 20000]) {
  const root = mkdtempSync(join(tmpdir(), 'crux-reconcile-bench-'));
  try {
    const config = new DesktopConfig(root);
    config.setGardenRoot(join(root, 'garden'));
    const projects = new ProjectFolders(config);
    const folder = projects.createFolder('measure');
    const bytes = Buffer.alloc(1024, 42);
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    const indexed = Array.from({ length: count }, (_, i) => ({
      path: `note-${i}.txt`,
      fingerprint,
    }));
    for (const file of indexed) writeFileSync(join(folder, file.path), bytes);
    const begin = performance.now();
    const unchanged = projects.reconcile(folder, indexed);
    const unchangedMs = performance.now() - begin;
    if (unchanged.events.length) throw new Error('Unchanged files were rewritten');
    const batch = Math.floor(count / 100);
    for (let i = 0; i < batch; i++) {
      writeFileSync(join(folder, `note-${i}.txt`), 'changed');
      rmSync(join(folder, `note-${i + batch}.txt`));
      writeFileSync(join(folder, `added-${i}.txt`), 'new');
    }
    const changedStart = performance.now();
    const changed = projects.reconcile(folder, indexed);
    const changedMs = performance.now() - changedStart;
    if (changed.events.length !== batch * 3) throw new Error('Incorrect change set');
    reports.push({
      count,
      fileBytes: 1024,
      unchangedMs: Math.round(unchangedMs),
      changedMs: Math.round(changedMs),
      events: changed.events.length,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
console.log(
  JSON.stringify(
    { platform: process.platform, arch: process.arch, cpu: cpus()[0].model, reports },
    null,
    2,
  ),
);
