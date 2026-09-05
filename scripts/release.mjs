#!/usr/bin/env node
// Cut a desktop release: bump electron/package.json, commit, tag, push.
//
//   npm run release 1.0.1          # exact version
//   npm run release patch          # 1.0.0 → 1.0.1   (also: minor, major)
//   npm run release patch -- --dry-run
//
// The tag is what triggers .github/workflows/release.yml, and that workflow
// refuses a tag that does not match electron/package.json — this script is
// how the two never disagree. It insists on a clean checkout of main that is
// level with origin, so a release is always a commit CI has seen (the
// workflow then waits for that commit's CI to be green before building).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = join(root, 'electron');
const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const spec = args.find((a) => !a.startsWith('--'));

const sh = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...opts,
  }).trim();
const run = (cmd, cmdArgs, opts = {}) => {
  console.log(`  $ ${cmd} ${cmdArgs.join(' ')}`);
  if (!dryRun) sh(cmd, cmdArgs, { stdio: 'inherit', ...opts });
};
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

if (!spec) fail('usage: npm run release <version|patch|minor|major> [-- --dry-run]');

const current = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version;
const next = (() => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) fail(`electron/package.json version "${current}" is not x.y.z`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (spec === 'major') return `${major + 1}.0.0`;
  if (spec === 'minor') return `${major}.${minor + 1}.0`;
  if (spec === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (!/^\d+\.\d+\.\d+$/.test(spec))
    fail(`"${spec}" is not a version (x.y.z) or patch/minor/major`);
  return spec;
})();
const tag = `v${next}`;

// ── Preconditions: main, clean, level with origin, tag unused ──────────────
const branch = sh('git', ['branch', '--show-current']);
if (branch !== 'main') fail(`releases are cut from main (on "${branch}")`);
if (sh('git', ['status', '--porcelain'])) fail('working tree is not clean');
sh('git', ['fetch', '--quiet', 'origin', 'main', '--tags']);
const local = sh('git', ['rev-parse', 'HEAD']);
const remote = sh('git', ['rev-parse', 'origin/main']);
if (local !== remote) fail('main is not level with origin/main — pull or push first');
if (sh('git', ['tag', '--list', tag])) fail(`tag ${tag} already exists`);
if (next === current) fail(`electron/package.json is already ${current}`);

console.log(`Release ${current} → ${next} (${tag})${dryRun ? '  [dry run]' : ''}`);

// ── Bump, commit, tag, push ────────────────────────────────────────────────
// npm version writes package.json and package-lock.json together.
run('npm', ['version', next, '--no-git-tag-version'], { cwd: electronDir });
run('git', ['add', 'electron/package.json', 'electron/package-lock.json']);
run('git', ['commit', '-m', `Release ${tag}`]);
run('git', ['tag', '-a', tag, '-m', `Crux Garden ${next}`]);
run('git', ['push', 'origin', 'main', tag]);

console.log(
  dryRun
    ? 'Dry run — nothing changed.'
    : [
        `Pushed ${tag}. GitHub → Actions → "Release (desktop)" is building it now.`,
        'It waits for CI on this commit to be green, then attaches signed installers to a draft release.',
        'Review the draft, add a line of notes, click Publish — the download button and the updater follow.',
      ].join('\n'),
);
