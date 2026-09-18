#!/usr/bin/env node
/**
 * Prebuild, but only what actually changed.
 *
 * `npm run dev`, `npm start` and `npm run build` all need the embedded apps'
 * `runtime/` output to exist before Vite reads it through `import.meta.glob`.
 * Building all two dozen of them from a clean `npm ci` every time is what made
 * those commands take tens of minutes even when nothing had changed.
 *
 * Each target is stamped with a hash of its own tracked sources. A target is
 * rebuilt when that hash moves or when its build output is missing; otherwise
 * it is skipped. `CRUX_PREBUILD_FORCE=1` rebuilds everything, and
 * `CRUX_PREBUILD_SKIP=1` skips the whole step (CI jobs that only need `tsc`).
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stampDir = path.join(root, 'node_modules', '.cache', 'crux-prebuild');

/**
 * script: the npm script that builds the target.
 * dirs:   the source trees whose contents decide whether it is stale.
 * out:    the build output; when it is gone the target is stale regardless.
 */
const TARGETS = [
  {
    script: 'prepare:astro-editors',
    dirs: ['notes-crux', 'moqira-crux'],
    out: ['notes-crux/runtime', 'moqira-crux/runtime'],
  },
  { script: 'build:openmosh', dirs: ['openmosh-crux'], out: ['openmosh-crux/runtime'] },
  { script: 'build:minipaint', dirs: ['minipaint-crux'], out: ['minipaint-crux/runtime'] },
  { script: 'build:mermaid', dirs: ['mermaid-crux'], out: ['mermaid-crux/runtime'] },
  { script: 'build:piskel', dirs: ['piskel-crux'], out: ['piskel-crux/dest'] },
  { script: 'build:rawgraphs', dirs: ['rawgraphs-crux'], out: ['rawgraphs-crux/runtime'] },
  { script: 'build:jupyterlite', dirs: ['jupyterlite-crux'], out: ['jupyterlite-crux/runtime'] },
  { script: 'build:gephi', dirs: ['gephi-crux'], out: ['gephi-crux/runtime'] },
  { script: 'build:ketcher', dirs: ['ketcher-crux'], out: ['ketcher-crux/runtime'] },
  { script: 'build:twine', dirs: ['twine-crux'], out: ['twine-crux/runtime'] },
  { script: 'build:svgedit', dirs: ['svgedit-crux'], out: ['svgedit-crux/runtime'] },
  { script: 'build:blockbench', dirs: ['blockbench-crux'], out: ['blockbench-crux/runtime'] },
  { script: 'build:gdevelop', dirs: ['gdevelop-crux'], out: ['gdevelop-crux/runtime'] },
  {
    script: 'build:playcanvas-editor',
    dirs: ['playcanvas-editor-crux'],
    out: ['playcanvas-editor-crux/runtime'],
  },
  { script: 'build:opencut', dirs: ['opencut-crux'], out: ['opencut-crux/runtime'] },
  { script: 'build:kan', dirs: ['kan-crux'], out: ['kan-crux/runtime'] },
  { script: 'build:web-synth', dirs: ['web-synth-crux'], out: ['web-synth-crux/runtime'] },
  { script: 'build:beepbox', dirs: ['beepbox-crux'], out: ['beepbox-crux/dist'] },
  { script: 'build:pptist', dirs: ['pptist-crux'], out: ['pptist-crux/runtime'] },
  { script: 'build:wick', dirs: ['wick-editor-crux'], out: ['wick-editor-crux/runtime'] },
  { script: 'build:bentopdf', dirs: ['bentopdf-crux'], out: ['bentopdf-crux/runtime'] },
  { script: 'build:glyphr', dirs: ['glyphr-crux'], out: ['glyphr-crux/runtime'] },
  { script: 'build:fmg', dirs: ['fmg-crux'], out: ['fmg-crux/runtime'] },
  { script: 'build:signal', dirs: ['signal-crux'], out: ['signal-crux/runtime'] },
];

/** Shared bridge sources are synced into several apps, so they dirty all of them. */
const SHARED = ['embedded-apps'];

/**
 * Content, not timestamps. Several of these builds rewrite files in place with
 * identical bytes (`sync-shared.mjs`, GDevelop's runtime copy, `npm install`
 * touching a lockfile), so an mtime-based hash reported almost every app as
 * stale on a warm run. Git's index already holds a content hash per tracked
 * file; only the files that differ from the index need hashing directly.
 */
function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function gitOut(args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 }).toString('utf8');
}

function hashOf(dirs) {
  const scope = [...dirs, ...SHARED];
  const h = createHash('sha256');
  try {
    // Staged content: "<mode> <sha> <stage>\t<path>" per tracked file.
    h.update(gitOut(['ls-files', '-s', '--', ...scope]));
    // Worktree edits the index has not seen yet.
    // `-uall` lists untracked files individually; without it Git reports a bare
    // directory, which `hash-object` cannot read.
    const dirty = gitOut(['status', '--porcelain', '-z', '-uall', '--', ...scope])
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.slice(3))
      .filter((file) => file && isFile(path.join(root, file)));
    if (dirty.length) {
      h.update(`dirty:${dirty.length}\n`);
      const hashed = execFileSync('git', ['hash-object', '--stdin-paths'], {
        cwd: root,
        input: dirty.join('\n') + '\n',
        maxBuffer: 1 << 28,
      }).toString('utf8');
      for (let i = 0; i < dirty.length; i += 1)
        h.update(`${dirty[i]}:${hashed.split('\n')[i] ?? ''}\n`);
    }
  } catch {
    return null; // not a git checkout — treat the target as always stale
  }
  return h.digest('hex');
}

function isStale(target) {
  if (process.env.CRUX_PREBUILD_FORCE === '1')
    return { stale: true, hash: hashOf(target.dirs), why: 'forced' };
  for (const out of target.out) {
    if (!existsSync(path.join(root, out)))
      return { stale: true, hash: hashOf(target.dirs), why: `missing ${out}` };
  }
  const hash = hashOf(target.dirs);
  if (hash === null) return { stale: true, hash, why: 'no git index' };
  const stamp = path.join(stampDir, `${target.script.replace(/[:/]/g, '_')}.hash`);
  let previous = null;
  try {
    previous = readFileSync(stamp, 'utf8').trim();
  } catch {
    /* never built here */
  }
  return previous === hash
    ? { stale: false, hash }
    : { stale: true, hash, why: previous ? 'sources changed' : 'first build' };
}

function main() {
  if (process.env.CRUX_PREBUILD_SKIP === '1') {
    console.log('prebuild: skipped (CRUX_PREBUILD_SKIP=1)');
    return;
  }
  mkdirSync(stampDir, { recursive: true });
  const plan = TARGETS.map((t) => ({ target: t, ...isStale(t) }));
  const stale = plan.filter((p) => p.stale);
  const fresh = plan.length - stale.length;
  if (!stale.length) {
    console.log(`prebuild: all ${plan.length} embedded apps up to date`);
    return;
  }
  console.log(
    `prebuild: ${stale.length} of ${plan.length} embedded apps need building (${fresh} up to date)`,
  );
  for (const { target, why } of stale) console.log(`  · ${target.script} — ${why}`);
  for (const { target } of stale) {
    console.log(`\n── ${target.script} ──`);
    const run = spawnSync('npm', ['run', target.script], { cwd: root, stdio: 'inherit' });
    if (run.status !== 0) {
      console.error(`prebuild: ${target.script} failed`);
      process.exit(run.status ?? 1);
    }
    // Re-hash after the build: some steps rewrite lockfiles or sync shared sources.
    const hash = hashOf(target.dirs);
    if (hash)
      writeFileSync(path.join(stampDir, `${target.script.replace(/[:/]/g, '_')}.hash`), hash);
  }
  console.log(`\nprebuild: built ${stale.length}, skipped ${fresh}`);
}

main();
